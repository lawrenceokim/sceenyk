import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import type { GenerationRow } from "@/lib/db/types";
import { getPricingConfiguration } from "@/lib/pricing/config";
import { projectIdSchema } from "@/lib/projects/validation";
import { attemptGenerationDispatch } from "./dispatch";
import {
  canAdvanceStage,
  canTransition,
  generationFailures,
  generationStages,
  type GenerationStage,
} from "./contract";
import {
  confirmGenerationSchema,
  generationReferenceSchema,
  generationVersionSchema,
  generationProjectIdsSchema,
} from "./validation";
import type {
  GenerationJob,
  GenerationResult,
  GenerationVersion,
} from "./types";

const columns =
  "id,request_id,project_id,input_snapshot,status,current_stage,error_code,error_message,started_at,completed_at,failed_at,created_at,updated_at,dispatch_status";
export class GenerationAccessError extends Error {
  constructor() {
    super("Generation status couldn’t be loaded. Please try again.");
    this.name = "GenerationAccessError";
  }
}
const unavailable = {
  ok: false,
  code: "UNAVAILABLE",
  message:
    "Your generation request couldn’t be confirmed. Check status or retry the same request.",
} as const;
const notFound = {
  ok: false,
  code: "NOT_FOUND",
  message: "This project or generation is unavailable.",
} as const;
const conflict = {
  ok: false,
  code: "CONFLICT",
  message:
    "The request has changed or this generation has already moved to another state. Check its latest status.",
} as const;
function logError(operation: string, error: { code?: string } | null) {
  const code =
    error?.code && /^[A-Z0-9_]{1,40}$/.test(error.code)
      ? error.code
      : "UNAVAILABLE";
  console.error("Generation database operation failed.", { operation, code });
}
function toJob(
  row: Omit<
    GenerationRow,
    | "owner_user_id"
    | "accounting_version"
    | "dispatch_attempts"
    | "last_dispatch_at"
    | "dispatched_at"
    | "dispatch_error"
    | "worker_run_id"
    | "worker_started_at"
  >,
): GenerationJob {
  return {
    id: row.id,
    requestId: row.request_id,
    projectId: row.project_id,
    input: row.input_snapshot,
    status: row.status,
    dispatchStatus: row.dispatch_status,
    stage: row.current_stage,
    errorCode: row.error_code,
    errorMessage: row.error_code ? generationFailures[row.error_code] : null,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    failedAt: row.failed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
async function context(projectId: string, owner: string) {
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_user_id", owner)
    .maybeSingle();
  if (error) {
    logError("project", error);
    throw new GenerationAccessError();
  }
  return data ? { database, owner } : null;
}

export async function createGenerationJob(
  input: unknown,
): Promise<GenerationResult<GenerationJob>> {
  // Authenticate even malformed requests; ownership is resolved independently.
  const user = await ensureAppUser();
  const parsed = confirmGenerationSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "INVALID_INPUT", message: "Review the generation cost before confirming." };
  const database = createDatabaseClient();
  const owner = user.id;
  const { data, error } = await database.rpc("confirm_generation_quote", {
    p_owner_user_id: owner,
    p_quote_id: parsed.data.quoteId,
    p_current_pricing_version: getPricingConfiguration().version,
  });
  if (error || !data) {
    logError("create", error);
    return unavailable;
  }
  if (data.code !== "ACCEPTED" || !data.job_id) {
    if (data.code === "QUOTE_STALE")
      return { ok: false, code: "QUOTE_STALE", message: "Your quote has changed or expired. Review a new quote before confirming." };
    if (data.code === "PAID_ACCESS_UNAVAILABLE")
      return { ok: false, code: "PAID_ACCESS_UNAVAILABLE", message: "Free generations are limited to 10 seconds and your remaining allowance. Paid access is not available yet." };
    if (data.code === "INSUFFICIENT_CREDITS")
      return { ok: false, code: "INSUFFICIENT_CREDITS", message: "You need more credits to create this video. Review a new quote for your current balance." };
    if (data.code === "CONFLICT") return conflict;
    if (data.code === "NOT_FOUND") return notFound;
    if (data.code === "INVALID_ASSETS")
      return { ok: false, code: "INVALID_ASSETS", message: "Refresh your uploaded project media and try again." };
    return unavailable;
  }
  await attemptGenerationDispatch(data.job_id);
  // Re-read for the dispatch hint when possible; the committed row still wins
  // if a later read is temporarily unavailable. Never lose a saved request.
  const refreshed = await database
    .from("generation_jobs")
    .select(columns)
    .eq("id", data.job_id)
    .eq("owner_user_id", owner)
    .maybeSingle();
  if (refreshed.error || !refreshed.data) {
    logError("admission-read", refreshed.error);
    return unavailable; // Same request UUID recovers the committed reservation/job.
  }
  return { ok: true, value: toJob(refreshed.data) };
}

export async function getOwnedGenerationJob(
  input: unknown,
): Promise<GenerationJob | null> {
  const user = await ensureAppUser();
  const parsed = generationReferenceSchema.safeParse(input);
  if (!parsed.success) return null;
  const ctx = await context(parsed.data.projectId, user.id);
  if (!ctx) return null;
  const { data, error } = await ctx.database
    .from("generation_jobs")
    .select(columns)
    .eq("id", parsed.data.jobId)
    .eq("project_id", parsed.data.projectId)
    .eq("owner_user_id", ctx.owner)
    .maybeSingle();
  if (error) {
    logError("read", error);
    throw new GenerationAccessError();
  }
  return data ? toJob(data) : null;
}
async function latest(
  database: ReturnType<typeof createDatabaseClient>,
  owner: string,
  projectId: string,
) {
  const { data, error } = await database
    .from("generation_jobs")
    .select(columns)
    .eq("owner_user_id", owner)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    logError("latest", error);
    throw new GenerationAccessError();
  }
  return data ? toJob(data) : null;
}
export async function getLatestProjectGeneration(
  input: unknown,
): Promise<GenerationJob | null> {
  const user = await ensureAppUser();
  const parsed = projectIdSchema.safeParse(input);
  if (!parsed.success) return null;
  const ctx = await context(parsed.data, user.id);
  return ctx ? latest(ctx.database, ctx.owner, parsed.data) : null;
}
// Only a dashboard page of IDs, never unbounded history or a supplied owner.
export async function getLatestProjectGenerations(
  input: unknown,
): Promise<Record<string, GenerationJob | null>> {
  const user = await ensureAppUser();
  const parsed = generationProjectIdsSchema.safeParse(input);
  if (!parsed.success) throw new GenerationAccessError();
  const ids = [...new Set(parsed.data)];
  if (!ids.length) return {};
  const database = createDatabaseClient();
  const { data, error } = await database
    .from("projects")
    .select("id")
    .eq("owner_user_id", user.id)
    .in("id", ids);
  if (error || !data) throw new GenerationAccessError();
  return Object.fromEntries(
    await Promise.all(
      data.map(
        async ({ id }) => [id, await latest(database, user.id, id)] as const,
      ),
    ),
  );
}

// Trusted server code only: no Server Action/route exports status mutations.
async function transition(
  input: unknown,
  expected: GenerationVersion,
  change: {
    status: GenerationJob["status"];
    current_stage: GenerationStage | null;
    error_code?: "PROCESSING_FAILED";
    error_message?: string;
  },
): Promise<GenerationResult<GenerationJob>> {
  const user = await ensureAppUser();
  const ref = generationReferenceSchema.safeParse(input);
  const version = generationVersionSchema.safeParse(expected);
  if (!ref.success || !version.success) return conflict;
  const advancing =
    version.data.status === "processing" &&
    change.status === "processing" &&
    version.data.stage &&
    change.current_stage &&
    canAdvanceStage(version.data.stage, change.current_stage);
  if (!advancing && !canTransition(version.data.status, change.status))
    return conflict;
  const ctx = await context(ref.data.projectId, user.id);
  if (!ctx) return notFound;
  let query = ctx.database
    .from("generation_jobs")
    .update(change)
    .eq("id", ref.data.jobId)
    .eq("project_id", ref.data.projectId)
    .eq("owner_user_id", ctx.owner)
    .eq("status", version.data.status);
  query = version.data.stage
    ? query.eq("current_stage", version.data.stage)
    : query.is("current_stage", null);
  const { data, error } = await query.select(columns).maybeSingle();
  if (error) {
    logError("transition", error);
    return unavailable;
  }
  return data ? { ok: true, value: toJob(data) } : conflict;
}
export async function startGenerationJob(input: unknown) {
  return transition(
    input,
    { status: "queued", stage: null },
    { status: "processing", current_stage: "preparing" },
  );
}
export async function advanceGenerationStage(
  input: unknown,
  expectedStage: GenerationStage,
  stage: GenerationStage,
) {
  if (!generationStages.includes(stage)) {
    await ensureAppUser();
    return conflict;
  }
  return transition(
    input,
    { status: "processing", stage: expectedStage },
    { status: "processing", current_stage: stage },
  );
}
export async function completeGenerationJob(
  input: unknown,
  expectedStage: GenerationStage,
) {
  return transition(
    input,
    { status: "processing", stage: expectedStage },
    { status: "completed", current_stage: null },
  );
}
export async function failGenerationJob(
  input: unknown,
  expected: GenerationVersion,
) {
  return transition(input, expected, {
    status: "failed",
    current_stage: expected.stage,
    error_code: "PROCESSING_FAILED",
    error_message: generationFailures.PROCESSING_FAILED,
  });
}
