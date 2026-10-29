// GET-only execution inspection: no worker, provider, RPC or real-state writes.
// Optional --speech-timing measures/fits temporary local copies only.
import { getDatabaseConfig } from "../lib/db/config";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { elevenLabsBindingRequest, elevenLabsDesignRequest } from "../lib/final-video-generation/adapters/elevenlabs";
import { getStorageConfig } from "../lib/storage/config";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { redactProviderText } from "../lib/final-video-generation/diagnostics";
import { effectiveAuthorization, latestOperations, type AuthorizationAmendment } from "../lib/final-video-generation/retry";
import { isFinalOperator } from "../lib/final-video-generation/operator";
import type { FinalExecution, Operation, FinalScene, CharacterVoiceProfile } from "../lib/final-video-generation/contract";
import type { PackageRow } from "../lib/video-generation-package/contract";
import { inspectSavedSpeech } from "./final-video-speech-inspection";

async function main() {
  const id = z.uuid().parse(process.argv[2]);
  const db = getDatabaseConfig(), originalFetch = globalThis.fetch;
  const allowed = new Set(["ugc_final_executions", "ugc_final_operations", "ugc_final_scenes", "ugc_final_events", "ugc_generation_packages", "ugc_character_voice_profiles", "ugc_final_authorization_amendments"]);
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (init?.method !== "GET" || url.origin !== db.url || !allowed.has(url.pathname.replace("/rest/v1/", ""))) throw new Error("INSPECTION_READ_ONLY");
    return originalFetch(input, init);
  };
  async function read<T>(table: string, filter: Record<string, string>): Promise<T[]> {
    const url = new URL(`/rest/v1/${table}`, db.url);
    url.search = new URLSearchParams({ select: "*", ...filter }).toString();
    const response = await fetch(url, { method: "GET", redirect: "error", headers: { apikey: db.secretKey, Authorization: `Bearer ${db.secretKey}` }, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`INSPECTION_DATABASE_${response.status}`);
    return response.json();
  }
  const [run] = await read<FinalExecution>("ugc_final_executions", { id: `eq.${id}` });
  if (!run) throw new Error("INSPECTION_EXECUTION_NOT_FOUND");
  const [operations, scenes, events, packages, profiles] = await Promise.all([
    read<Operation>("ugc_final_operations", { execution_id: `eq.${id}`, order: "created_at.asc" }),
    read<FinalScene>("ugc_final_scenes", { execution_id: `eq.${id}`, order: "scene_number.asc" }),
    read("ugc_final_events", { execution_id: `eq.${id}`, order: "id.asc" }),
    read<PackageRow>("ugc_generation_packages", { id: `eq.${run.package_id}` }),
    run.profile ? read("ugc_character_voice_profiles", { id: `eq.${run.profile.id}`, owner_user_id: `eq.${run.owner_user_id}`, project_id: `eq.${run.project_id}` }) : [],
  ]);
  const amendments = run.dispatch_mode ? await read<AuthorizationAmendment>("ugc_final_authorization_amendments",
    { execution_id: `eq.${id}`, owner_user_id: `eq.${run.owner_user_id}`, order: "created_at.asc" }) : [];
  const directory = path.resolve(process.env.UGC_FINAL_RECOVERY_DIR || ".ugc-final-recovery", id);
  let localFiles: { name: string; sizeBytes: number; json?: unknown }[] = [];
  try {
    localFiles = await Promise.all((await fs.readdir(directory)).map(async name => {
      const stat = await fs.lstat(path.join(directory, name));
      const json = stat.isFile() && stat.size <= 2 * 1024 * 1024 && /\.(?:json)$/.test(name)
        ? JSON.parse(await fs.readFile(path.join(directory, name), "utf8")) : undefined;
      return { name, sizeBytes: stat.size, json, sha256: stat.isFile() ? createHash("sha256").update(await fs.readFile(path.join(directory, name))).digest("hex") : null };
    }));
  } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const reconstructed = operations.filter(op => op.kind === "design").map(op => {
    return { operationId: op.id, source: op.receipt?.request ? "persisted sanitized outbound payload" : "deterministically reconstructed from persisted operation input; original wire bytes were not retained",
      endpoint: "https://api.elevenlabs.io/v1/text-to-voice/design", output_format: "mp3_44100_128", model: op.model,
      payload: op.receipt?.request?.payload ?? elevenLabsDesignRequest(op.input.profile as CharacterVoiceProfile, op.input.previewText as string),
      referenceCount: 0, referenceTypes: [], duration: null, aspectRatio: null, resolution: null,
      nativeVideoAudio: "not applicable; Voice Design returns audio previews" };
  });
  const latest = latestOperations(operations), savedDesign = latest.get("voice:design");
  const bindingInspection = operations.filter(op => op.kind === "binding").map(op => {
    const payload = op.receipt?.request?.payload as { labels?: Record<string, string>; generated_voice_id?: string } | undefined;
    const previewId = (savedDesign?.receipt?.result as { previewRef?: string } | undefined)?.previewRef;
    const reusable = savedDesign?.state === "ready" && !!savedDesign.output && !!previewId && !!run.profile &&
      (savedDesign.input.profile as CharacterVoiceProfile | undefined)?.id === run.profile.id &&
      op.input.previewFingerprint === savedDesign.fingerprint && op.input.profileId === run.profile.id && payload?.generated_voice_id === previewId;
    return { operationId: op.id, attempt: op.attempt, source: "persisted sanitized outbound payload", payload,
      labels: Object.entries(payload?.labels ?? {}).map(([name, value]) => ({ name, value, characterCount: [...value].length, valid: [...value].length <= 50 })),
      savedDesignOperationId: savedDesign?.id, savedDesignAttempt: savedDesign?.attempt, savedDesignFingerprint: savedDesign?.fingerprint,
      savedGeneratedVoiceId: previewId, reusableSavedDesign: reusable,
      proposedCorrectedPayload: reusable ? elevenLabsBindingRequest(run.profile!, savedDesign!.receipt!) : null };
  });
  let r2Objects;
  if (process.argv.includes("--storage")) {
    const storage = getStorageConfig();
    const sdk = new S3Client({ region: "auto", endpoint: storage.endpoint, credentials: { accessKeyId: storage.accessKeyId, secretAccessKey: storage.secretAccessKey }, maxAttempts: 1 });
    try {
      const prefix = `ugc/${run.owner_user_id}/${run.project_id}/${run.job_id}/final-video-v1/${run.id}/`;
      const result = await sdk.send(new ListObjectsV2Command({ Bucket: storage.bucket, Prefix: prefix, MaxKeys: 1000 }), { abortSignal: AbortSignal.timeout(20000) });
      r2Objects = { completeListing: !result.IsTruncated, objects: result.Contents?.map(object => ({ name: object.Key?.slice(prefix.length), sizeBytes: object.Size, etag: object.ETag })) ?? [] };
    } finally { sdk.destroy(); }
  }
  const secrets = ["FAL_KEY", "ELEVENLABS_API_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "R2_SECRET_ACCESS_KEY", "R2_ACCESS_KEY_ID"].map(name => process.env[name] ?? "");
  const speechInspection = process.argv.includes("--speech-timing") ? await inspectSavedSpeech(run, operations) : undefined;
  console.info(JSON.stringify({ readOnly: true, execution: { id: run.id, jobId: run.job_id, state: run.state, phase: run.phase, error: run.error_code,
    packageId: run.package_id, packageHash: run.package_hash, configurationHash: run.configuration_hash,
    createdAt: run.created_at, updatedAt: run.updated_at, paidRequests: run.paid_requests,
    maxRequests: run.configuration.maxRequests, estimatedCostMicrousd: run.estimated_cost_microusd,
    finalAsset: run.final_asset, profileBound: !!run.profile_binding },
    requestAuthorization: effectiveAuthorization(run, amendments), retrySchemaAvailable: run.dispatch_mode !== undefined,
    operatorConfigured: isFinalOperator(run.owner_user_id), operatorUserId: process.argv.includes("--operator-setup") ? run.owner_user_id : undefined,
    amendments: amendments.map(({ id, stage, reason, failed_operation_id, additional_requests, additional_cost_microusd, operator_approved, reviewed_http_status, created_at }) =>
      ({ id, stage, reason, failedOperationId: failed_operation_id, additionalRequests: additional_requests, additionalCostMicrousd: additional_cost_microusd,
        operatorApproved: operator_approved, reviewedHttpStatus: reviewed_http_status, createdAt: created_at })),
    operations: operations.map(({ input, owner_user_id, project_id, ...op }) => {
      void owner_user_id; void project_id; return { ...op, costEstimate: input.costEstimate };
    }), scenes, eventCount: events.length, eventStates: [...new Set(events.map(event => JSON.stringify(event, ["state", "phase", "error_code"])))].map(value => JSON.parse(value)),
    packageUntouched: packages[0]?.package_hash === run.package_hash,
    savedVoiceProfiles: profiles.length, localFiles, r2Objects, reconstructed, bindingInspection, speechInspection, rpcInvocations: 0, providerCalls: 0 },
  (key, value) => /^(?:claim_token|worker_id|storageKey|key|statusLocator|resultLocator|downloadLocator|audio_base_64|audio_base64|authorization|api[_-]?key|access[_-]?token)$/i.test(key)
    ? "[REDACTED]" : typeof value === "string" ? value.trim() === "" ? value : redactProviderText(value, secrets) : value, 2));
}
main().catch(error => { console.error(error instanceof Error && /^INSPECTION_[A-Z0-9_]+$/.test(error.message) ? error.message : "INSPECTION_FAILED"); process.exitCode = 1; });
