import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { generationReferenceSchema } from "@/lib/generation/validation";
import { compositionPlanSchema } from "./contract";

export async function getOwnedComposition(input: unknown) {
  const user = await ensureAppUser(), ref = generationReferenceSchema.safeParse(input);
  if (!ref.success) return null;
  const db = createDatabaseClient();
  const project = await db.from("projects").select("id").eq("id", ref.data.projectId).eq("owner_user_id", user.id).eq("status", "draft").maybeSingle();
  if (project.error) throw new Error("COMPOSITION_UNAVAILABLE");
  if (!project.data) return null;
  const result = await db.from("composition_plans").select("plan").eq("job_id", ref.data.jobId).eq("project_id", ref.data.projectId).eq("owner_user_id", user.id).maybeSingle();
  if (result.error) throw new Error("COMPOSITION_UNAVAILABLE");
  return result.data ? compositionPlanSchema.parse(result.data.plan) : null;
}
