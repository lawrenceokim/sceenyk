import "server-only";
import { isDeepStrictEqual } from "node:util";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedReferenceReview, ReferenceReviewAccessError } from "@/lib/reference-review/server";
import { compositeRecord } from "@/lib/ugc-jobs/claim-contract";
import { packageActionSchema, type PackageReview } from "./contract";
import { packageSummary } from "./projection";
import { packageInputFingerprint, validatePackageInput, validateVideoGenerationPackage, PackageValidationError } from "./builder";
import { verifyPackageMedia } from "./media";

export class PackageSetupError extends ReferenceReviewAccessError {
  constructor() { super(503); }
}
const setupError = (code: string) => ["PGRST202", "PGRST205", "42883", "42P01"].includes(code);
export async function readGenerationPackage(job: { id: string; project_id: string; owner_user_id: string }) {
  const db = createDatabaseClient();
  const result = await db.from("ugc_generation_packages").select("*").eq("job_id", job.id).eq("project_id", job.project_id)
    .eq("owner_user_id", job.owner_user_id).order("revision", { ascending: false }).limit(1).maybeSingle();
  if (result.error) {
    if (setupError(result.error.code)) return { review: undefined, eligible: false, available: false };
    throw new ReferenceReviewAccessError(503);
  }
  const source = await db.rpc("ugc_package_input", { p_job: job.id });
  if (source.error) { if (setupError(source.error.code)) throw new PackageSetupError(); throw new ReferenceReviewAccessError(503); }
  const row = result.data;
  let eligible = false;
  try { if (source.data) { validatePackageInput(source.data); eligible = true; } } catch {}
  if (!row) return { review: undefined, eligible, available: true };
  const current = eligible && row.stale_at === null && isDeepStrictEqual(source.data, row.input) &&
    packageInputFingerprint(row.input) === row.input_fingerprint;
  const leased = !!row.claim_token && Date.parse(row.lease_expires_at ?? "") > Date.now();
  const review: PackageReview = { id: row.id, version: row.version, revision: row.revision, state: row.state, phase: row.phase,
    current, summary: packageSummary(row), error: row.error_code, approvedAt: row.approved_at,
    canApprove: current && row.state === "review" && !leased, canDelete: row.state !== "deleted" && !leased,
    canRetry: current && row.state === "failed" && row.attempts < 3 && !leased,
    attempts: row.attempts, heartbeatAt: row.heartbeat_at, leaseExpiresAt: row.lease_expires_at, updatedAt: row.updated_at };
  return { review, eligible, available: true };
}
export async function generationPackageAction(input: unknown) {
  const parsed = packageActionSchema.safeParse(input);
  if (!parsed.success) throw new ReferenceReviewAccessError(400);
  const data = parsed.data;
  const context = await ownedReferenceReview({ projectId: data.projectId, jobId: data.jobId });
  if (data.action !== "reject" && process.env.UGC_PACKAGE_ENABLED !== "1") throw new PackageSetupError();
  let payload: Record<string, unknown> = { ...(data.packageId ? { packageId: data.packageId } : {}) };
  if (data.action === "prepare") {
    const source = await context.db.rpc("ugc_package_input", { p_job: context.job.id });
    if (source.error) { if (setupError(source.error.code)) throw new PackageSetupError(); throw new ReferenceReviewAccessError(503); }
    if (!source.data) throw new PackageValidationError("PACKAGE_INPUT_CHANGED");
    const value = validatePackageInput(source.data);
    if (value.ownerId !== context.ownerId || value.projectId !== data.projectId || value.jobId !== data.jobId) throw new ReferenceReviewAccessError(409);
    payload = { ...payload, input: value, fingerprint: packageInputFingerprint(value), requestId: data.requestId };
  }
  if (data.action === "approve") {
    const saved = await context.db.from("ugc_generation_packages").select("*").eq("id", data.packageId!).eq("job_id", data.jobId)
      .eq("project_id", data.projectId).eq("owner_user_id", context.ownerId).maybeSingle();
    if (saved.error || !saved.data || !["review", "approved"].includes(saved.data.state)) throw new ReferenceReviewAccessError(409);
    if (saved.data.stale_at || saved.data.state !== "approved" && saved.data.version !== data.version) throw new PackageValidationError("PACKAGE_INPUT_CHANGED");
    const current = await context.db.rpc("ugc_package_input", { p_job: data.jobId });
    if (current.error) throw new ReferenceReviewAccessError(503);
    if (!current.data || !isDeepStrictEqual(current.data, saved.data.input)) throw new PackageValidationError("PACKAGE_INPUT_CHANGED");
    validateVideoGenerationPackage(saved.data.document, saved.data.input, saved.data.revision);
    await verifyPackageMedia(saved.data.input, AbortSignal.timeout(45_000));
    // The RPC rechecks ownership, expected version and all current approvals
    // under locks after these private reads, including concurrent source edits.
  }
  const result = await context.db.rpc("ugc_package_action", { p_owner: context.ownerId, p_project: data.projectId,
    p_job: data.jobId, p_version: data.version, p_action: data.action, p_payload: payload });
  if (result.error) { if (setupError(result.error.code)) throw new PackageSetupError(); throw new ReferenceReviewAccessError(503); }
  if (!compositeRecord(result.data)?.id) throw new ReferenceReviewAccessError(409);
  return (await readGenerationPackage(context.job)).review;
}
