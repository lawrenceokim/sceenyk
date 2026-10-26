import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { HiggsfieldSoul2CharacterSheetProvider } from "@/lib/character-sheet/higgsfield";
import { composeCharacterSheet } from "@/lib/character-sheet/media";
import { CharacterSheetError } from "@/lib/character-sheet/provider";
import { readR2AnalysisMedia, signR2CharacterSource } from "@/lib/storage/r2";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import type { UgcStageHandler } from "@/lib/ugc-jobs/runner";
import type { UgcJobRow } from "@/lib/ugc-jobs/contract";
import { CharacterV5Error, v5Generation, type V5Candidate, type V5Phase, type V5Workflow } from "./contract";
import { cropV5Front, readV5Artifact, recoverV5Artifact, saveV5Artifact, technicalPng, v5Prefix, v5OutputProof } from "./storage";
import { logV5Failure, v5DatabaseError, type V5DatabaseOperation } from "./database-diagnostics";
import { readbackV5Candidate } from "./persistence";
import { logV5Back } from "./back-diagnostics";

function soulIdMode() {
  const value = process.env.UGC_CHARACTER_V5_SOUL_ID_MODE ?? "reuse";
  if (!["off", "reuse"].includes(value)) throw new CharacterV5Error("input_read", "CHARACTER_CONFIG_INVALID");
  return value;
}
export async function existingV5SoulId(job: UgcJobRow) {
  if (soulIdMode() === "off") return undefined;
  const result = await createDatabaseClient().from("ugc_character_sheets").select("document")
    .eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
  if (result.error) throw new CharacterV5Error("input_read");
  const document = result.data?.document as { operations?: { identity?: { state?: string; providerId?: string } } } | undefined;
  const identity = document?.operations?.identity;
  return identity?.state === "completed" && z.uuid().safeParse(identity.providerId).success ? identity.providerId : undefined;
}
export const startCharacterV5: UgcStageHandler = async ({ job }) => {
  const result = await createDatabaseClient().rpc("ugc_character_v5_start", { p_owner: job.owner_user_id, p_project: job.project_id,
    p_job: job.id, p_token: job.claim_token!, p_soul_id: await existingV5SoulId(job) });
  if (result.error) {
    logV5Failure(v5DatabaseError(result.error, { operation: "start_workflow", phase: "candidate_insertion", slot: "face", version: 1 }));
    return { kind: "fail", code: "WORKER_ERROR" };
  }
  if (!result.data) return { kind: "fail", code: "WORKER_ERROR" }; // A failed ownership/lease prerequisite is not a storage failure.
  return { kind: "character_review" };
};
async function originalInput(job: UgcJobRow, signal: AbortSignal) {
  const snapshot = ugcGenerationSnapshotSchema.parse(job.input_snapshot);
  const source = snapshot.character;
  const result = await createDatabaseClient().from("project_assets").select("*").eq("id", source.assetId)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).eq("studio_role", "character")
    .eq("upload_status", "uploaded").eq("removed_from_draft", false).maybeSingle();
  const asset = result.data;
  if (result.error || !asset || asset.storage_provider !== "r2" || asset.media_type !== "image" || asset.verified_etag !== source.etag ||
    asset.reference_id !== source.referenceId || asset.mime_type !== source.mimeType || asset.size_bytes !== source.sizeBytes || source.sizeBytes > 20 * 1024 * 1024) {
    throw new CharacterV5Error("input_read");
  }
  const stream = await readR2AnalysisMedia(asset.storage_key, source.etag, source.sizeBytes,
    AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break;
    size += part.value.length; if (size > source.sizeBytes) throw new CharacterV5Error("input_read"); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = Buffer.concat(chunks);
  if (size !== source.sizeBytes) throw new CharacterV5Error("input_read");
  await technicalPng(bytes);
  return { key: asset.storage_key, etag: source.etag, id: source.assetId, sha256: createHash("sha256").update(bytes).digest("hex") };
}
function pollDelay(signal: AbortSignal) {
  return new Promise<void>(resolve => {
    if (signal.aborted) return resolve();
    const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
    const timer = setTimeout(finish, 5_000); signal.addEventListener("abort", finish, { once: true });
  });
}
export async function runCharacterV5(workflow: V5Workflow, shutdown: AbortSignal) {
  const db = createDatabaseClient(); const abort = new AbortController();
  const signal = AbortSignal.any([shutdown, abort.signal]);
  let phase: V5Phase = "candidate_readback"; let pending: Promise<unknown> = Promise.resolve(); let lost = false;
  let providerTerminal = false;
  let committed = false; let published = false;
  const checkpoint = (operation: string, payload: Record<string, unknown> = {}) => {
    const task = pending.then(async () => {
      if (lost) throw new CharacterV5Error("candidate_insertion", "RECONCILIATION_REQUIRED");
      const result = await db.rpc("ugc_character_v5_checkpoint", { p_workflow: workflow.id, p_token: workflow.claim_token!,
        p_candidate: workflow.candidate_id!, p_operation: operation, p_payload: payload });
      const operations: Record<string, V5DatabaseOperation> = { heartbeat: "heartbeat", intent: "checkpoint_intent", submitted: "checkpoint_submitted",
        output: "checkpoint_output", ready: "persist_candidate", fail: "checkpoint_failure" };
      if (result.error || !result.data) throw v5DatabaseError(result.error, { operation: operations[operation] ?? "persist_candidate",
        phase: "candidate_insertion", slot: workflow.slot, version: workflow.version });
      return result.data;
    });
    pending = task.catch(() => {}); return task;
  };
  const timer = setInterval(() => { void checkpoint("heartbeat").catch(() => { lost = true; abort.abort(); }); }, 20_000);
  try {
    const candidateResult = await db.from("ugc_character_v5_candidates").select("*").eq("id", workflow.candidate_id!)
      .eq("workflow_id", workflow.id).single();
    if (candidateResult.error || !candidateResult.data) throw v5DatabaseError(candidateResult.error, { operation: "read_candidate", phase: "candidate_readback",
      slot: workflow.slot, version: workflow.version });
    let candidate: V5Candidate = candidateResult.data;
    if (candidate.slot !== workflow.slot) throw new CharacterV5Error("other", "RECONCILIATION_REQUIRED");
    if (["intent", "submitted"].includes(candidate.state) && candidate.planned_key === `${v5Prefix(workflow)}${candidate.id}.png`) {
      const recovered = await recoverV5Artifact(workflow, candidate.id, signal, candidate.output_proof);
      if (recovered) {
        committed = true; await checkpoint("ready", { artifact: recovered }); published = true;
        await readbackV5Candidate(workflow, candidate.id); return;
      }
    }
    let bytes: Buffer;
    if (workflow.slot === "front" || workflow.slot === "sheet") {
      if (candidate.state === "queued") {
        const slots = workflow.slot === "front" ? ["front_source"] as const : ["front", "back", "face"] as const;
        const inputs = Object.fromEntries(slots.map(slot => {
          const asset = workflow.accepted[slot]; if (!asset) throw new CharacterV5Error(workflow.slot === "front" ? "local_crop" : "sheet_composition");
          return [slot, { id: asset.id, sha256: asset.sha256, etag: asset.etag }];
        }));
        candidate = await checkpoint("intent", { plannedKey: `${v5Prefix(workflow)}${candidate.id}.png`,
          generation: { promptVersion: 5, contractVersion: 5, revision: "simple-manual-review-v1", model: "sharp", slot: workflow.slot,
            inputs, ...(workflow.slot === "front" ? { cropTop: workflow.crop_top } : {}) }, inputAsset: inputs.front_source ?? null });
      }
      if (candidate.state !== "intent") throw new CharacterV5Error("other", "RECONCILIATION_REQUIRED");
      if (workflow.slot === "front") {
        phase = "local_crop";
        if (!workflow.accepted.front_source) throw new CharacterV5Error(phase);
        bytes = await cropV5Front(await readV5Artifact(workflow, workflow.accepted.front_source, signal), workflow.crop_top);
      } else {
        phase = "sheet_composition";
        const { front, back, face } = workflow.accepted;
        if (!front || !back || !face) throw new CharacterV5Error(phase);
        bytes = await composeCharacterSheet(await Promise.all([front, back, face].map(asset => readV5Artifact(workflow, asset, signal))) as [Buffer, Buffer, Buffer]);
      }
    } else {
      const provider = new HiggsfieldSoul2CharacterSheetProvider();
      if (candidate.state === "queued") {
        phase = "input_read";
        const jobResult = await db.from("ugc_generation_jobs").select("*").eq("id", workflow.job_id)
          .eq("owner_user_id", workflow.owner_user_id).eq("project_id", workflow.project_id).single();
        if (jobResult.error || !jobResult.data) throw new CharacterV5Error(phase);
        let input: { key: string; id: string; etag: string; sha256: string; kind?: "accepted_face" | "original_upload" };
        if (workflow.slot === "front_source") {
          const back = workflow.accepted.back;
          if (!back || !workflow.accepted.face) throw new CharacterV5Error(phase);
          await readV5Artifact(workflow, back, signal);
          input = { key: back.storageKey, id: back.id, etag: back.etag, sha256: back.sha256 };
        } else if (workflow.slot === "back") {
          // Preserve Face-first admission. An unavailable/corrupt accepted Face
          // must never silently switch the request to the Original upload.
          const face = workflow.accepted.face;
          if (!face) throw new CharacterV5Error(phase, "CHARACTER_ACCEPTED_FACE_REQUIRED");
          await readV5Artifact(workflow, face, signal);
          input = { key: face.storageKey, id: face.id, etag: face.etag, sha256: face.sha256, kind: "accepted_face" };
        } else {
          input = await originalInput(jobResult.data, signal);
        }
        phase = "input_sign";
        const imageUrl = await signR2CharacterSource(input.key, input.etag);
        candidate = await checkpoint("intent", { plannedKey: `${v5Prefix(workflow)}${candidate.id}.png`,
          generation: v5Generation(workflow.slot, workflow.soul_id), inputAsset: { id: input.id, etag: input.etag, sha256: input.sha256,
            ...(workflow.slot === "back" ? { storageKey: input.key, kind: input.kind } : {}) } });
        logV5Back("intent", candidate);
        phase = "provider_submit";
        const receipt = await provider.submitManualView({ slot: workflow.slot, imageUrl, soulId: workflow.soul_id, key: candidate.id,
          ...(workflow.slot === "back" ? { source: candidate.input_asset! } : {}) }, signal);
        candidate = await checkpoint("submitted", { requestId: receipt.id, statusUrl: receipt.statusUrl });
        logV5Back("submitted", candidate);
      }
      // A crash after an intent is uncertain. It never authorizes another POST.
      if (candidate.state !== "submitted" || !candidate.request_id || !candidate.status_url) throw new CharacterV5Error("provider_submit", "RECONCILIATION_REQUIRED");
      phase = "provider_status";
      let outputUrl: string | undefined;
      const deadline = Date.now() + 12 * 60_000;
      while (Date.now() < deadline) {
        signal.throwIfAborted();
        const result = await provider.viewStatus(candidate.request_id, candidate.status_url, signal, workflow.slot === "front_source" ? "front" : workflow.slot);
        if (result.state === "failed") { providerTerminal = true; throw new CharacterV5Error(phase, "CHARACTER_PROVIDER_FAILED"); }
        if (result.state === "completed") { outputUrl = result.imageUrl; break; }
        await pollDelay(signal);
      }
      if (!outputUrl) throw new CharacterV5Error(phase, "CHARACTER_TIMEOUT");
      phase = "provider_output_download";
      const output = await provider.downloadImage(outputUrl, signal);
      phase = "image_decode"; bytes = await technicalPng(output.bytes);
    }
    signal.throwIfAborted();
    phase = "candidate_insertion";
    candidate = await checkpoint("output", { proof: await v5OutputProof(candidate.id, bytes) });
    phase = "r2_write";
    const artifact = await saveV5Artifact(workflow, candidate.id, bytes, signal, !!candidate.request_id && !!candidate.status_url);
    committed = true;
    phase = "candidate_insertion";
    await checkpoint("ready", { artifact });
    published = true;
    phase = "candidate_readback";
    await readbackV5Candidate(workflow, candidate.id);
  } catch (error) {
    if (!lost && !shutdown.aborted) {
      const safe = error instanceof CharacterV5Error ? error : new CharacterV5Error(phase,
        error instanceof CharacterSheetError ? error.diagnostic?.reason ?? error.code : undefined);
      if (error instanceof CharacterSheetError && error.definitelyRejected) providerTerminal = true;
      if (safe.phase === "image_decode" || ["CHARACTER_OUTPUT_MIME_INVALID", "CHARACTER_OUTPUT_EMPTY", "CHARACTER_OUTPUT_TOO_LARGE",
        "CHARACTER_FACE_OUTPUT_MISSING", "CHARACTER_BACK_OUTPUT_MISSING", "CHARACTER_FRONT_OUTPUT_MISSING"].includes(safe.code)) providerTerminal = true;
      logV5Failure(safe);
      // A successful publication followed by a failed read must not regress the
      // review row or lose the committed image. Reload/recovery reads it again.
      if (published) return;
      try { await checkpoint("fail", { phase: safe.phase, code: safe.code, providerTerminal }); }
      catch (failure) { logV5Failure(failure instanceof CharacterV5Error ? failure : new CharacterV5Error("candidate_insertion", "CHARACTER_CANDIDATE_PERSISTENCE_FAILED")); }
      if (committed) console.info("UGC_CHARACTER_V5_IMAGE_PRESERVED", JSON.stringify({ slot: workflow.slot, version: workflow.version,
        safeReason: "The private image was written; metadata recovery must reuse this candidate." }));
    }
  } finally { clearInterval(timer); await pending; }
}
