import "server-only";
import { z } from "zod";
import { requireClerkUser } from "@/lib/auth/require-user";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { assertV3Access } from "./runtime-config";
import { v3DatabaseFailure } from "./database-errors";
import type { FinalOperationStatus } from "./final-operation";

// The authenticated session supplies identity. Profile synchronization is needed
// for account creation, not every final-output action on an existing account.
export async function finalActionUser(create = true) {
  const { userId } = await requireClerkUser();
  const result = await createDatabaseClient().from("app_users").select("id").eq("clerk_user_id", userId).maybeSingle();
  if (result.error) v3DatabaseFailure(result.error, "read_final_account", result.status);
  if (result.data) return result.data;
  if (create) return ensureAppUser();
  throw new Error("V3_ACCOUNT_UNAVAILABLE");
}

export async function readOwnedV3FinalStatus(query: URLSearchParams): Promise<FinalOperationStatus> {
  const project = z.uuid().parse(query.get("project")), packageId = z.uuid().parse(query.get("package"));
  const manifest = z.string().regex(/^[a-f0-9]{64}$/).parse(query.get("manifest"));
  const user = await finalActionUser(false); assertV3Access(user.id);
  const db = createDatabaseClient();
  // Privileged reads always bind BOTH the active owned project and V3 enrollment.
  const [owned, enrolled] = await Promise.all([
    db.from("projects").select("id").eq("id", project).eq("owner_user_id", user.id).eq("studio_mode", "pro").is("deleted_at", null).maybeSingle(),
    db.from("ugc_v3_projects").select("project_id").eq("project_id", project).eq("owner_user_id", user.id).maybeSingle(),
  ]);
  for (const row of [owned, enrolled]) if (row.error) v3DatabaseFailure(row.error, "read_final_project", row.status);
  if (!owned.data || !enrolled.data) throw new Error("FRESH_V3_PROJECT_REQUIRED");
  const tasks = await db.from("ugc_v3_tasks").select("id,status,output,error_code")
    .eq("project_id", project).eq("kind", "join").eq("input->>packageId", packageId).eq("input->>manifestHash", manifest)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (tasks.error) v3DatabaseFailure(tasks.error, "read_final_task", tasks.status);
  const task = z.object({ id: z.uuid(), status: z.string(), output: z.unknown().nullable(), error_code: z.string().nullable() }).nullable().parse(tasks.data);
  const artifact = task ? await db.from("ugc_v3_artifacts").select("id,approved_at,rejected_at")
    .eq("project_id", project).eq("kind", "joined").eq("id", task.id).eq("document->>packageId", packageId)
    .eq("document->>manifestHash", manifest).maybeSingle() : null;
  if (artifact?.error) v3DatabaseFailure(artifact.error, "read_final_result", artifact.status);
  const result = z.object({ id: z.uuid(), approved_at: z.string().nullable(), rejected_at: z.string().nullable() }).nullable().parse(artifact?.data ?? null);
  const deletion = result?.rejected_at ? await db.from("ugc_v3_tasks").select("status,error_code")
    .eq("project_id", project).eq("kind", "delete").eq("input->>artifactId", result.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle() : null;
  if (deletion?.error) v3DatabaseFailure(deletion.error, "read_final_deletion", deletion.status);
  const deletionRow = z.object({ status: z.string(), error_code: z.string().nullable() }).nullable().parse(deletion?.data ?? null);
  const output = task?.output as { mergeStage?: unknown } | null;
  return { taskId: task?.id ?? null, status: task?.status ?? null,
    stage: typeof output?.mergeStage === "string" ? output.mergeStage : null,
    errorCode: deletionRow?.error_code ?? task?.error_code ?? null,
    resultId: result?.id ?? null, approved: !!result?.approved_at, rejected: !!result?.rejected_at,
    deletionStatus: deletionRow?.status ?? null };
}
