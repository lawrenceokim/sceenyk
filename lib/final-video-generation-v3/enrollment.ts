import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { v3LocalEnabled } from "./runtime-config";

export function eligibleForV3(ownerId: string, creationType: string) {
  return creationType === "ugc" && v3LocalEnabled() && process.env.UGC_V3_OPERATOR_USER_ID === ownerId;
}
// Internal helper. Caller must resolve the authenticated owner independently.
export async function enrolledV3(ownerId: string, projectId: string) {
  const db = createDatabaseClient() as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string } | null }> };
  const result = await db.rpc("ugc_v3_read", { p_owner: ownerId, p_project: projectId });
  if (result.error?.code === "PGRST202") return false;
  if (result.error) throw new Error("V3_ENROLLMENT_UNAVAILABLE");
  if (result.data === null) return false;
  const record = z.object({ project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid() }) }).parse(result.data);
  if (record.project.project_id !== projectId || record.project.owner_user_id !== ownerId) throw new Error("V3_ENROLLMENT_UNAVAILABLE");
  return true;
}
