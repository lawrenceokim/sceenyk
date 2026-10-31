import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { planningInputSchema } from "./contract";
import { artifactSchema, quoteSchema, runSchema, runtimeAuthorizationSchema, taskSchema } from "./runtime-contract";

export type V3RpcName = "ugc_v3_regenerate_approved_reference" | "ugc_v3_package_begin" | "ugc_v3_package_checkpoint" | "ugc_v3_package_commit" | "ugc_v3_reconcile_reference_cleanup" | "ugc_v3_discard_reference_prepare" | "ugc_v3_discard_reference_finish" | "ugc_v3_queue_reference_cleanup" | "ugc_v3_location_action" | "ugc_v3_location_checkpoint" | "ugc_v3_location_input_current" | "ugc_v3_create_project" | "ugc_v3_write" | "ugc_v3_runtime_read" | "ugc_v3_runtime_action" | "ugc_v3_task_claim" | "ugc_v3_task_checkpoint" | "ugc_v3_retire_reference_task" | "ugc_v3_regenerate_reference" | "ugc_v3_reference_delete_prepare" | "ugc_v3_reference_delete_finish" | "ugc_v3_recover_reference_task" | "ugc_v3_replace_unusable_reference_task" | "ugc_v3_record_reference_diagnostic";
export type V3RpcPort = { rpc(name: V3RpcName, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export const runtimeWorkspaceSchema = z.object({ project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid(), logical_job_id: z.uuid() }),
  source: z.object({ revision: z.number().int(), input: planningInputSchema, private_bindings: z.record(z.string(), z.unknown()), current: z.boolean(), created_at: z.string() }).nullable(),
  packages: z.array(z.object({ id: z.uuid(), document: z.unknown() })), tasks: z.array(taskSchema), artifacts: z.array(artifactSchema),
  quotes: z.array(z.object({ document: quoteSchema })), runtimeAuthorizations: z.array(z.object({ document: runtimeAuthorizationSchema })),
  referenceCleanupPolicy: z.boolean().default(false),
  referenceDeletions: z.array(z.object({ id: z.uuid(), kind: z.enum(["character", "product", "location"]), artifact_version: z.number().int(), state: z.enum(["prepared", "completed"]), mode: z.enum(["reject","regenerate"]).optional(), errorCode: z.string().nullable().optional() })).default([]),
  referenceDiagnostics: z.array(z.object({ taskId: z.uuid(), stage: z.string(), httpStatus: z.number().int().min(100).max(599).nullable(),
    requestId: z.string().nullable(), errorCode: z.string().nullable(), providerCode: z.string().nullable().optional() })).default([]),
  runs: z.array(runSchema.extend({ current: z.boolean() })) });
export type RuntimeWorkspace = z.infer<typeof runtimeWorkspaceSchema>;
export class V3Store {
  constructor(private readonly database: V3RpcPort = createDatabaseClient() as unknown as V3RpcPort) {}
  async rpc(name: V3RpcName, args: Record<string, unknown>) {
    const { data, error } = await this.database.rpc(name, args);
    if (error) {
      if ((name.startsWith("ugc_v3_package_") || name === "ugc_v3_reconcile_reference_cleanup" || name === "ugc_v3_regenerate_approved_reference") && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new Error("V3_PACKAGE_SETUP_REQUIRED");
      if (["ugc_v3_discard_reference_prepare","ugc_v3_discard_reference_finish","ugc_v3_queue_reference_cleanup"].includes(name) && typeof error === "object" && "code" in error && ["PGRST202","42883"].includes(String(error.code)))
        throw new Error("V3_REFERENCE_RETENTION_SETUP_REQUIRED");
      if (name.startsWith("ugc_v3_location_") && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new Error("V3_LOCATION_SETUP_REQUIRED");
      if (["ugc_v3_recover_reference_task", "ugc_v3_replace_unusable_reference_task"].includes(name) && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new Error("V3_REFERENCE_RECOVERY_SETUP_REQUIRED");
      if (["ugc_v3_reference_delete_prepare", "ugc_v3_reference_delete_finish"].includes(name) && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new Error("V3_REFERENCE_DELETE_SETUP_REQUIRED");
      if (name === "ugc_v3_regenerate_reference" && typeof error === "object" && "code" in error && ["PGRST202", "42883"].includes(String(error.code)))
        throw new Error("V3_REFERENCE_REGENERATION_SETUP_REQUIRED");
      const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" && /^[A-Z0-9_]{1,100}$/.test(error.message)
        ? error.message : "V3_DATABASE_UNAVAILABLE";
      throw new Error(message);
    }
    return data;
  }
  async read(owner: string, project: string) {
    const data = await this.rpc("ugc_v3_runtime_read", { p_owner: owner, p_project: project });
    if (!data) throw new Error("FRESH_V3_PROJECT_REQUIRED"); return runtimeWorkspaceSchema.parse(data);
  }
  action(owner: string, project: string, action: string, payload: unknown) {
    return this.rpc("ugc_v3_runtime_action", { p_owner: owner, p_project: project, p_action: action, p_payload: payload });
  }
  async checkpoint(task: { id: string; lease_token: string | null }, action: string, payload: unknown = {}) {
    if (!task.lease_token || await this.rpc("ugc_v3_task_checkpoint", { p_task: task.id, p_token: task.lease_token, p_action: action, p_payload: payload }) !== true)
      throw new Error("V3_LEASE_LOST");
  }
}
