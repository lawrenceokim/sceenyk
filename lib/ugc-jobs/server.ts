import "server-only";
import { z } from "zod";
import { auth } from "@clerk/nextjs/server";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { type UgcJobProgress, type UgcJobRow, type UgcProgressEvent } from "./contract";
import { buildUgcProgress, type UgcProgressEvidence } from "./progress";
import { characterSheetDocumentSchema } from "@/lib/character-sheet/contract";
import { productSheetDocumentSchema } from "@/lib/product-sheet/contract";
import { readReferenceReviewState } from "@/lib/reference-review/state";
import { readLocationReview } from "@/lib/location-reference/server";
import { withLocationProgress } from "@/lib/location-reference/progress";
import { readStoryboard } from "@/lib/storyboard/server";
import { withStoryboardProgress } from "@/lib/storyboard/progress";
import { readGenerationPackage } from "@/lib/video-generation-package/server";
import { withPackageProgress } from "@/lib/video-generation-package/progress";
import { readFinalVideo } from "@/lib/final-video-generation/server";
import { withFinalVideoProgress } from "@/lib/final-video-generation/progress";
import { validateUgcGenerationInput } from "./validation";
import { ugcInputIssue, type UgcInputIssue, type UgcReadiness } from "./input-contract";

const enqueueSchema = z.strictObject({ projectId: z.uuid(), idempotencyKey: z.uuid() });
const referenceSchema = z.strictObject({ projectId: z.uuid(), jobId: z.uuid() });
const progressSchema = referenceSchema.partial({ jobId: true });
export class UgcJobAccessError extends Error {
  constructor() { super("This generation job is unavailable."); }
}
export class UgcJobAuthenticationError extends Error {
  constructor() { super("Sign in to view generation progress."); }
}
export class UgcProgressReadError extends Error {
  readonly databaseCode: string | undefined;
  constructor(readonly phase: "identity" | "project" | "job" | "history" | "character" | "product" | "analyses" | "review", error: { code?: string }) {
    super("Generation progress could not be read.");
    this.databaseCode = ["PGRST202", "PGRST204", "PGRST205", "42501", "42883", "42703"].includes(error.code ?? "") ? error.code : undefined;
  }
}

export function toUgcJobProgress(row: UgcJobRow): UgcJobProgress {
  return buildUgcProgress(row);
}

export type UgcEnqueueResult = { ok: true; job: UgcJobProgress } | { ok: false; issues: UgcInputIssue[] };

export async function getOwnedUgcReadiness(input: unknown): Promise<UgcReadiness> {
  const user = await ensureAppUser();
  const parsed = z.uuid().safeParse(input);
  if (!parsed.success) return { ready: false, issues: [ugcInputIssue("PROJECT_UNAVAILABLE")] };
  const result = await validateUgcGenerationInput(parsed.data, user.id);
  return result.ready ? { ready: true, issues: [] } : result;
}

// Validation only, not paid generation admission. Never accepts browser snapshots.
export async function enqueueOwnedUgcJob(input: unknown): Promise<UgcEnqueueResult> {
  const user = await ensureAppUser();
  const parsed = enqueueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, issues: [ugcInputIssue("PROJECT_UNAVAILABLE")] };
  const db = createDatabaseClient();
  // Recover the same request after a lost response without substituting later
  // draft edits or requiring media that the original job may have consumed.
  const existing = await db.from("ugc_generation_jobs").select("*").eq("owner_user_id", user.id)
    .eq("idempotency_key", parsed.data.idempotencyKey).maybeSingle();
  if (existing.error) return { ok: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  if (existing.data) return existing.data.project_id === parsed.data.projectId
    ? { ok: true, job: toUgcJobProgress(existing.data) } : { ok: false, issues: [ugcInputIssue("INPUT_CHANGED")] };
  const validation = await validateUgcGenerationInput(parsed.data.projectId, user.id);
  if (!validation.ready) return { ok: false, issues: validation.issues };
  const { data, error } = await db.rpc("ugc_enqueue_validated_job", {
    p_owner_user_id: user.id, p_project_id: parsed.data.projectId, p_idempotency_key: parsed.data.idempotencyKey,
    p_input_snapshot: validation.data,
  });
  if (error || !data) return { ok: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  if (data.code !== "ACCEPTED") return { ok: false, issues: [ugcInputIssue(data.code)] };
  return { ok: true, job: toUgcJobProgress(data.job) };
}

export async function getOwnedUgcJobProgress(input: unknown): Promise<UgcJobProgress | null> {
  const parsed = progressSchema.safeParse(input);
  if (!parsed.success) throw new UgcJobAccessError();
  // Polling reads the validated session and existing identity only. Do not sync
  // the Clerk profile/upsert app_users on every progress request.
  const { userId } = await auth();
  if (!userId) throw new UgcJobAuthenticationError();
  const db = createDatabaseClient();
  const identity = await db.from("app_users").select("id").eq("clerk_user_id", userId).maybeSingle();
  if (identity.error) throw new UgcProgressReadError("identity", identity.error);
  if (!identity.data) throw new UgcJobAccessError();
  const user = identity.data;
  const project = await db.from("projects").select("id").eq("id", parsed.data.projectId).eq("owner_user_id", user.id).eq("status", "draft").maybeSingle();
  if (project.error) throw new UgcProgressReadError("project", project.error);
  if (!project.data) throw new UgcJobAccessError();
  const ownedJobs = () => db.from("ugc_generation_jobs").select("*")
    .eq("project_id", parsed.data.projectId).eq("owner_user_id", user.id);
  // Restore the newest active job, even when a more recent request failed.
  // Otherwise retain the last terminal result, including its failure details.
  let result = parsed.data.jobId ? await ownedJobs().eq("id", parsed.data.jobId).maybeSingle() :
    await ownedJobs().in("status", ["queued", "running", "awaiting_confirmation"])
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new UgcProgressReadError("job", result.error);
  if (!result.data && !parsed.data.jobId) result = await ownedJobs()
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new UgcProgressReadError("job", result.error);
  if (parsed.data.jobId && !result.data) throw new UgcJobAccessError();
  const job = result.data;
  if (!job) return null;
  const [history, sheet, analyses, productSheet] = await Promise.all([
    db.from("ugc_generation_job_events").select("id,job_id,stage,event_type,safe_message,metadata,created_at")
      .eq("job_id", job.id).order("id", { ascending: false }).limit(160),
    db.from("ugc_character_sheets").select("id,sheet_version,document,status,character_name").eq("job_id", job.id)
      .eq("owner_user_id", user.id).eq("project_id", job.project_id).maybeSingle(),
    db.from("ugc_reference_analyses").select("analysis_type,state").eq("job_id", job.id)
      .eq("owner_user_id", user.id).eq("project_id", job.project_id).eq("state", "completed"),
    db.from("ugc_product_sheets").select("id,sheet_version,document,status,product_name").eq("job_id", job.id)
      .eq("owner_user_id", user.id).eq("project_id", job.project_id).maybeSingle(),
  ]);
  if (history.error) throw new UgcProgressReadError("history", history.error);
  if (sheet.error) throw new UgcProgressReadError("character", sheet.error);
  if (analyses.error) throw new UgcProgressReadError("analyses", analyses.error);
  // Before manual 045, preserve the existing Character-complete progress surface.
  if (productSheet.error && !["PGRST205", "42P01"].includes(productSheet.error.code)) throw new UgcProgressReadError("product", productSheet.error);
  // Never spread event metadata, a checkpoint document or a provider diagnostic
  // into the DTO. Historical events are already constrained to fixed safe copy.
  const events: UgcProgressEvent[] = (history.data ?? []).reverse().map(event => ({
    id: event.id, jobId: job.id, stage: event.stage, type: event.event_type,
    message: event.safe_message, at: event.created_at,
    ...(typeof event.metadata.version === "number" && Number.isSafeInteger(event.metadata.version) ? { referenceVersion: event.metadata.version } :
      typeof event.metadata.version === "string" && /^[1-9]\d{0,6}$/.test(event.metadata.version) ? { referenceVersion: Number(event.metadata.version) } : {}),
    ...(["front", "back", "face", "primary", "angle", "detail"].includes(event.metadata.view ?? "") ? { view: event.metadata.view } : {}),
  }));
  const evidence: UgcProgressEvidence = {
    events, analyses: {
      character: !!analyses.data?.some(item => item.analysis_type === "character"),
      product: !!analyses.data?.some(item => item.analysis_type === "product"),
    },
  };
  const parsedDocument = characterSheetDocumentSchema.safeParse(sheet.data?.document);
  if (sheet.data && parsedDocument.success) {
    const document = parsedDocument.data;
    const view = (name: "front" | "back" | "face") => ({
      started: !!document.operations[name], ready: !!document.assets[name], phase: document.operations[name]?.workPhase,
      failed: document.operations[name]?.state === "failed" || document.operations[name]?.state === "rejected" && !!document.operations[name]?.generation ||
        ["rejected", "unavailable"].includes(document.operations[name]?.validation?.state ?? ""),
    });
    evidence.character = {
      v4: document.strategyRevision === "face-back-front-v1", faceReused: document.assets.face?.faceOrigin === "original",
      name: sheet.data.character_name, prepared: !!document.operations.identity,
      identityReady: document.operations.identity?.state === "completed",
      views: { front: view("front"), back: view("back"), face: view("face") },
      sheetReady: !!document.assets.sheet, complete: sheet.data.status === "completed",
      composing: events.some(event => event.type === "character_reference.composing" ||
        event.type === "character_progress" && event.message === "Building character sheet"),
    };
  }
  const parsedProduct = productSheetDocumentSchema.safeParse(productSheet.data?.document);
  if (productSheet.data && parsedProduct.success) {
    const document = parsedProduct.data;
    const view = (name: "primary" | "angle" | "detail") => ({
      started: !!document.operations[name], ready: !!document.assets[name],
      failed: document.operations[name]?.state === "rejected",
    });
    evidence.product = { name: productSheet.data.product_name, complete: productSheet.data.status === "completed",
      views: { primary: view("primary"), angle: view("angle"), detail: view("detail") },
      sheetReady: !!document.assets.sheet, composing: events.some(event => event.type === "product_reference.composing") };
  }
  try { evidence.referenceReview = await readReferenceReviewState(job, { character: sheet.data, product: productSheet.data }); }
  catch { throw new UgcProgressReadError("review", {}); }
  const location = await readLocationReview(job);
  const [storyboard, generationPackage, finalVideo] = await Promise.all([readStoryboard(job), readGenerationPackage(job), readFinalVideo(job)]);
  return withFinalVideoProgress(withPackageProgress(withStoryboardProgress(withLocationProgress({ ...buildUgcProgress(job, evidence), locationEnabled: process.env.UGC_LOCATION_ENABLED === "1" }, location), storyboard.review, storyboard.eligible),
    generationPackage.review, generationPackage.eligible, generationPackage.available), finalVideo);
}

export async function requestOwnedUgcJobCancellation(input: unknown): Promise<UgcJobProgress> {
  const user = await ensureAppUser();
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success) throw new UgcJobAccessError();
  const { data, error } = await createDatabaseClient().rpc("ugc_cancel_owned_job", {
    p_owner_user_id: user.id, p_project_id: parsed.data.projectId, p_job_id: parsed.data.jobId,
  });
  if (error || !data) throw new UgcJobAccessError();
  return toUgcJobProgress(data);
}

// Explicit, bounded retry of known safe failures; never a provider restart button.
export async function retryOwnedUgcJob(input: unknown): Promise<UgcJobProgress> {
  const user = await ensureAppUser();
  const parsed = referenceSchema.safeParse(input);
  if (!parsed.success) throw new UgcJobAccessError();
  const { data, error } = await createDatabaseClient().rpc("ugc_retry_owned_job", {
    p_owner_user_id: user.id, p_project_id: parsed.data.projectId, p_job_id: parsed.data.jobId,
  });
  if (error || !data) throw new UgcJobAccessError();
  return toUgcJobProgress(data);
}
