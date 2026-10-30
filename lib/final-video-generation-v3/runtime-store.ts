import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { planningInputSchema } from "./contract";
import { artifactSchema, quoteSchema, runSchema, runtimeAuthorizationSchema, taskSchema } from "./runtime-contract";

export type V3RpcName = "ugc_v3_create_project" | "ugc_v3_write" | "ugc_v3_runtime_read" | "ugc_v3_runtime_action" | "ugc_v3_task_claim" | "ugc_v3_task_checkpoint" | "ugc_v3_retire_reference_task";
export type V3RpcPort = { rpc(name: V3RpcName, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };
export const runtimeWorkspaceSchema = z.object({ project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid(), logical_job_id: z.uuid() }),
  source: z.object({ revision: z.number().int(), input: planningInputSchema, private_bindings: z.record(z.string(), z.unknown()), current: z.boolean(), created_at: z.string() }).nullable(),
  packages: z.array(z.object({ id: z.uuid(), document: z.unknown() })), tasks: z.array(taskSchema), artifacts: z.array(artifactSchema),
  quotes: z.array(z.object({ document: quoteSchema })), runtimeAuthorizations: z.array(z.object({ document: runtimeAuthorizationSchema })),
  runs: z.array(runSchema.extend({ current: z.boolean() })) });
export type RuntimeWorkspace = z.infer<typeof runtimeWorkspaceSchema>;
export class V3Store {
  constructor(private readonly database: V3RpcPort = createDatabaseClient() as unknown as V3RpcPort) {}
  async rpc(name: V3RpcName, args: Record<string, unknown>) {
    const { data, error } = await this.database.rpc(name, args);
    if (error) {
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
