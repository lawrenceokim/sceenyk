import "server-only";
import { z } from "zod";
import { V3DatabaseError } from "./database-errors";
import { createDatabaseClient } from "@/lib/db/server";
import { planningInputSchema } from "./contract";
import { artifactSchema, quoteSchema, runSchema, runtimeAuthorizationSchema, taskSchema } from "./runtime-contract";
import { creativeLockRowSchema } from "./creative-lock-contract";
import { lockDocument } from "./creative-lock";
import { pinApprovedPackage } from "./package";

export type V3RpcName = "ugc_v3_clip_lock_setup" | "ugc_v3_recover_clip_lock" | "ugc_v3_merge_begin" | "ugc_v3_merge_stage" | "ugc_v3_merge_setup" | "ugc_v3_clip_retryable" | "ugc_v3_clip_authorize" | "ugc_v3_clip_manifest" | "ugc_v3_clip_setup" | "ugc_v3_approve_video" | "ugc_v3_background_setup" | "ugc_v3_worker_projects" | "ugc_v3_worker_claim" | "ugc_v3_video_stage" | "ugc_v3_worker_resume_known" | "ugc_v3_refresh_video_delivery" | "ugc_v3_runtime_current" | "ugc_v3_video_setup" | "ugc_v3_local_package_begin" | "ugc_v3_local_price_repair" | "ugc_v3_regenerate_approved_reference" | "ugc_v3_package_begin" | "ugc_v3_package_checkpoint" | "ugc_v3_package_commit" | "ugc_v3_reconcile_reference_cleanup" | "ugc_v3_discard_reference_prepare" | "ugc_v3_discard_reference_finish" | "ugc_v3_queue_reference_cleanup" | "ugc_v3_location_action" | "ugc_v3_location_checkpoint" | "ugc_v3_location_input_current" | "ugc_v3_create_project" | "ugc_v3_write" | "ugc_v3_runtime_read" | "ugc_v3_runtime_action" | "ugc_v3_task_claim" | "ugc_v3_task_checkpoint" | "ugc_v3_retire_reference_task" | "ugc_v3_regenerate_reference" | "ugc_v3_reference_delete_prepare" | "ugc_v3_reference_delete_finish" | "ugc_v3_recover_reference_task" | "ugc_v3_replace_unusable_reference_task" | "ugc_v3_record_reference_diagnostic";
export type V3RpcPort = { rpc(name: V3RpcName | "laptop_v3_worker_claim" | "ugc_v3_completed_video_claim", args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown; status?: number }> };
export const runtimeWorkspaceSchema = z.object({ project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid(), logical_job_id: z.uuid(), studio_mode: z.enum(["basic", "pro"]).optional() }),
  source: z.object({ revision: z.number().int(), input: planningInputSchema, private_bindings: z.record(z.string(), z.unknown()), current: z.boolean(), created_at: z.string() }).nullable(),
  packages: z.array(z.object({ id: z.uuid(), document: z.unknown() })), tasks: z.array(taskSchema), artifacts: z.array(artifactSchema),
  quotes: z.array(z.object({ document: quoteSchema })), runtimeAuthorizations: z.array(z.object({ document: runtimeAuthorizationSchema })),
  referenceCleanupPolicy: z.boolean().default(false),
  creativeLock: creativeLockRowSchema.nullable().optional(),
  referenceDeletions: z.array(z.object({ id: z.uuid(), kind: z.enum(["character", "product", "location"]), artifact_version: z.number().int(), state: z.enum(["prepared", "completed"]), subjectId: z.uuid().nullable().optional(), mode: z.enum(["reject","regenerate"]).optional(), errorCode: z.string().nullable().optional() })).default([]),
  referenceDiagnostics: z.array(z.object({ taskId: z.uuid(), stage: z.string(), httpStatus: z.number().int().min(100).max(599).nullable(),
    requestId: z.string().nullable(), errorCode: z.string().nullable(), providerCode: z.string().nullable().optional() })).default([]),
  runs: z.array(runSchema.extend({ current: z.boolean() })) });
export type RuntimeWorkspace = z.infer<typeof runtimeWorkspaceSchema>;
export class V3Store {
  constructor(private readonly database: V3RpcPort = createDatabaseClient() as unknown as V3RpcPort) {}
  async rpc(name: V3RpcName | "laptop_v3_worker_claim" | "ugc_v3_completed_video_claim", args: Record<string, unknown>) {
    let result;
    try { result = await this.database.rpc(name, args); } catch (error) { throw new V3DatabaseError(error, name); }
    const { data, error } = result;
    if (error) {
      if (name === "ugc_v3_clip_lock_setup" && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_CREATIVE_LOCK_SETUP_REQUIRED", result.status);
      if (name === "ugc_v3_video_setup" && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_VIDEO_SETUP_REQUIRED", result.status);
      if (name.startsWith("ugc_v3_merge_") && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_MERGE_SETUP_REQUIRED", result.status);
      if (name.startsWith("ugc_v3_clip_") && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_CLIP_SETUP_REQUIRED", result.status);
      if (name === "ugc_v3_approve_video" && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_DIRECT_APPROVAL_SETUP_REQUIRED", result.status);
      if (["ugc_v3_background_setup", "ugc_v3_worker_projects", "ugc_v3_worker_claim", "ugc_v3_video_stage", "ugc_v3_worker_resume_known"].includes(name) && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_BACKGROUND_SETUP_REQUIRED", result.status);
      if (name === "ugc_v3_refresh_video_delivery" && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_VIDEO_DELIVERY_REFRESH_SETUP_REQUIRED", result.status);
      if (name.startsWith("ugc_v3_local_") && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code))) throw new V3DatabaseError(error, name, "V3_LOCAL_PRICING_SETUP_REQUIRED", result.status);
      if ((name.startsWith("ugc_v3_package_") || name === "ugc_v3_reconcile_reference_cleanup" || name === "ugc_v3_regenerate_approved_reference") && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new V3DatabaseError(error, name, "V3_PACKAGE_SETUP_REQUIRED", result.status);
      if (["ugc_v3_discard_reference_prepare","ugc_v3_discard_reference_finish","ugc_v3_queue_reference_cleanup"].includes(name) && typeof error === "object" && "code" in error && ["PGRST202","42883"].includes(String(error.code)))
        throw new V3DatabaseError(error, name, "V3_REFERENCE_RETENTION_SETUP_REQUIRED", result.status);
      if (name.startsWith("ugc_v3_location_") && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new V3DatabaseError(error, name, "V3_LOCATION_SETUP_REQUIRED", result.status);
      if (["ugc_v3_recover_reference_task", "ugc_v3_replace_unusable_reference_task"].includes(name) && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new V3DatabaseError(error, name, "V3_REFERENCE_RECOVERY_SETUP_REQUIRED", result.status);
      if (["ugc_v3_reference_delete_prepare", "ugc_v3_reference_delete_finish"].includes(name) && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new V3DatabaseError(error, name, "V3_REFERENCE_DELETE_SETUP_REQUIRED", result.status);
      if (name === "ugc_v3_regenerate_reference" && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new V3DatabaseError(error, name, "V3_REFERENCE_REGENERATION_SETUP_REQUIRED", result.status);
      const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" && /^[A-Z0-9_]{1,100}$/.test(error.message)
        ? error.message : "V3_DATABASE_UNAVAILABLE";
      if (message !== "V3_DATABASE_UNAVAILABLE" && (typeof error === "object" && "code" in error && error.code === "P0001" || /^(V3_|PACKAGE_|APPROV|CURRENT_|FRESH_|PAID_|INVALID_|REFERENCE_|QUOTE_|VIDEO_|JOINED_|COST_|SUBMISSION_)/.test(message))) throw new Error(message);
      throw new V3DatabaseError(error, name, undefined, result.status);
    }
    return data;
  }
  async read(owner: string, project: string) {
    const data = await this.rpc("ugc_v3_runtime_read", { p_owner: owner, p_project: project });
    if (!data) throw new Error("FRESH_V3_PROJECT_REQUIRED");
    const workspace = runtimeWorkspaceSchema.parse(data), snapshot = lockDocument(workspace);
    // The immutable package remains readable even if another bound asset needs
    // repair. Submission/currentness still requires the separate SQL valid flag.
    if (snapshot) {
      const selected = workspace.packages.find(p => p.id === workspace.creativeLock!.package_id);
      if (selected && snapshot.package) {
        pinApprovedPackage(selected.document, (snapshot.package as { hash: string }).hash);
        workspace.packages = [...workspace.packages.filter(p => p.id !== selected.id), selected];
      }
    }
    return workspace;
  }
  action(owner: string, project: string, action: string, payload: unknown) {
    return this.rpc("ugc_v3_runtime_action", { p_owner: owner, p_project: project, p_action: action, p_payload: payload });
  }
  async checkpoint(task: { id: string; lease_token: string | null }, action: string, payload: unknown = {}) {
    if (!task.lease_token || await this.rpc("ugc_v3_task_checkpoint", { p_task: task.id, p_token: task.lease_token, p_action: action, p_payload: payload }) !== true)
      throw new Error("V3_LEASE_LOST");
  }
}
