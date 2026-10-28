import "server-only";
import { isDeepStrictEqual } from "node:util";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedReferenceReview, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { readGenerationPackage } from "@/lib/video-generation-package/server";
import { validateVideoGenerationPackage } from "@/lib/video-generation-package/builder";
import { finalConfiguration } from "./config";
import { finalProviders } from "./adapters/registry";
import { finalPreflight } from "./preflight";
import { finalActionSchema, FinalVideoError, phaseLabels, type FinalAvailability, type FinalExecution, type FinalReview } from "./contract";
import { packageDigest } from "@/lib/video-generation-package/builder";
import { readPrivateAsset } from "./storage";
import { FinalPreflightError, type CapabilityIssue } from "./capabilities";

type Scope = { id: string; project_id: string; owner_user_id: string };
const missing = (code: string) => ["PGRST202", "PGRST205", "42P01", "42883"].includes(code);
const consentVersion = (hash: string, packageId: string, packageHash: string, owner: string) =>
  packageDigest("sceenyk-final-consent", { configurationHash: hash, packageId, packageHash, owner });
export function finalReview(row: FinalExecution, current: boolean): FinalReview {
  const leased = !!row.claim_token && Date.parse(row.lease_expires_at ?? "") > Date.now();
  const ratio = row.final_asset ? row.final_asset.width === row.final_asset.height ? "1:1" : row.final_asset.width > row.final_asset.height ? "16:9" : "9:16" : "";
  return { id: row.id, version: row.version, revision: row.revision, state: row.state, phase: row.phase,
    label: phaseLabels[row.phase], current, error: row.error_code,
    durationMs: row.final_asset?.durationMs ?? null, width: row.final_asset?.width ?? null, height: row.final_asset?.height ?? null,
    aspectRatio: ratio,
    canApprove: current && row.state === "review" && !leased, canReject: row.state === "review" && !leased,
    canRecover: ["failed", "reconciling"].includes(row.state) && !leased, updatedAt: row.updated_at,
    heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at };
}
export async function readFinalVideo(job: Scope): Promise<FinalAvailability> {
  const db = createDatabaseClient(); let configured: ReturnType<typeof finalConfiguration> | null = null;
  try { configured = finalConfiguration(); } catch {}
  const records = await db.from("ugc_final_executions").select("*").eq("job_id", job.id).eq("owner_user_id", job.owner_user_id)
    .eq("project_id", job.project_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (records.error) {
    if (missing(records.error.code)) return { available: false, enabled: false, eligible: false, authorization: null };
    throw new FinalVideoError("FINAL_READ_UNAVAILABLE", 503);
  }
  const packageState = await readGenerationPackage(job);
  const packageRow = packageState.review?.state === "approved" && packageState.review.current ?
    await db.from("ugc_generation_packages").select("*").eq("id", packageState.review.id).eq("owner_user_id", job.owner_user_id)
      .eq("project_id", job.project_id).eq("job_id", job.id).single() : null;
  const eligible = !!packageRow?.data && !!configured;
  let review;
  if (records.data) {
    const current = await db.rpc("ugc_final_current", { p_execution: records.data.id });
    if (current.error) throw new FinalVideoError("FINAL_READ_UNAVAILABLE", 503);
    review = finalReview(records.data, current.data);
  }
  return { available: true, enabled: !!configured, eligible, review,
    authorization: eligible && configured && packageRow?.data ? {
      version: consentVersion(configured.hash, packageRow.data.id, packageRow.data.package_hash!, job.owner_user_id),
      maxRequests: configured.value.maxRequests, maxEstimatedCostMicrousd: configured.value.maxEstimatedCostMicrousd,
      language: configured.value.language } : null };
}
export async function ownedFinalExecution(input: { projectId: string; jobId: string; executionId: string }) {
  const scope = await ownedReferenceReview({ projectId: input.projectId, jobId: input.jobId });
  const found = await scope.db.from("ugc_final_executions").select("*").eq("id", input.executionId)
    .eq("owner_user_id", scope.ownerId).eq("project_id", input.projectId).eq("job_id", input.jobId).maybeSingle();
  if (found.error || !found.data) throw new ReferenceReviewAccessError(404);
  return { ...scope, execution: found.data };
}
export async function finalVideoAction(value: unknown) {
  const command = finalActionSchema.safeParse(value);
  if (!command.success) throw new FinalVideoError("FINAL_INVALID_ACTION", 400);
  const input = command.data;
  const scope = await ownedReferenceReview({ projectId: input.projectId, jobId: input.jobId });
  let payload: Record<string, unknown> = { executionId: input.executionId, version: input.version };
  if (input.action === "generate") {
    if (!input.packageId || !input.requestId || !input.acceptedCost || scope.job.status === "completed") throw new FinalVideoError("FINAL_AUTHORIZATION_REQUIRED");
    const configured = finalConfiguration();
    const saved = await scope.db.from("ugc_generation_packages").select("*").eq("id", input.packageId).eq("job_id", input.jobId)
      .eq("owner_user_id", scope.ownerId).eq("project_id", input.projectId).single();
    if (saved.error || !saved.data || saved.data.state !== "approved" || saved.data.stale_at) throw new FinalVideoError("FINAL_PACKAGE_CHANGED");
    const current = await scope.db.rpc("ugc_package_input", { p_job: input.jobId });
    if (current.error || !isDeepStrictEqual(current.data, saved.data.input)) throw new FinalVideoError("FINAL_PACKAGE_CHANGED");
    const doc = validateVideoGenerationPackage(saved.data.document, saved.data.input, saved.data.revision);
    if (input.authorizationVersion !== consentVersion(configured.hash, saved.data.id, doc.packageHash, scope.ownerId)) throw new FinalVideoError("FINAL_AUTHORIZATION_CHANGED");
    const plan = finalPreflight(doc, configured.value, finalProviders());
    if (plan.diagnostics.length) throw new FinalPreflightError(plan.diagnostics);
    payload = { packageId: saved.data.id, requestId: input.requestId, acceptedCost: true,
      configuration: configured.value, configurationHash: configured.hash, profile: plan.profile };
  } else {
    if (!input.executionId) throw new FinalVideoError("FINAL_INVALID_ACTION", 400);
    const found = await ownedFinalExecution({ projectId: input.projectId, jobId: input.jobId, executionId: input.executionId });
    if (input.action === "approve") {
      if (!found.execution.final_asset || found.execution.state !== "review" && found.execution.state !== "approved") throw new FinalVideoError("FINAL_NOT_READY");
      await readPrivateAsset(found.execution, found.execution.final_asset, AbortSignal.timeout(120_000));
    }
    if (input.action === "recover") finalConfiguration();
  }
  const result = await scope.db.rpc("ugc_final_action", { p_owner: scope.ownerId, p_project: input.projectId,
    p_job: input.jobId, p_action: input.action, p_payload: payload });
  if (result.error) throw new FinalVideoError(missing(result.error.code) ? "FINAL_SETUP_REQUIRED" : "FINAL_ACTION_UNAVAILABLE", 503);
  if (!result.data?.id) throw new FinalVideoError("FINAL_CONFLICT");
  return readFinalVideo(scope.job);
}
export function finalErrorMessage(code: string, diagnostics?: readonly CapabilityIssue[]) {
  if (diagnostics?.length) return `${diagnostics[0].message} No new generation was queued.`;
  if (code.startsWith("FINAL_CAPABILITY:")) return `This package does not match the configured video/audio profile (${code.slice(17)}). No new generation was queued.`;
  if (code.includes("FUNDING") || code.includes("SETUP")) return "Final video generation needs manual local setup and explicit funding authorization.";
  if (code.includes("AUTHORIZATION")) return "The generation budget changed. Check status before confirming the current authorization.";
  if (code.includes("PACKAGE")) return "The approved package changed. Rebuild and approve a current package before generating.";
  return "Final video action stopped safely. Check status; existing generated work is preserved.";
}
