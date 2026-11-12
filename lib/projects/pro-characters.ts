import "server-only";
import type { createDatabaseClient } from "@/lib/db/server";
import { enrolledV3 } from "@/lib/final-video-generation-v3/enrollment";

// No tier/payment inference. Existing historical projects keep their own workflow.
export async function allowsProCharacters(database: ReturnType<typeof createDatabaseClient>, owner: string, project: string) {
  const { data, error } = await database.from("projects").select("studio_mode").eq("id", project).eq("owner_user_id", owner).eq("status", "draft").maybeSingle();
  if (error || !data || data.studio_mode !== "pro") return false;
  return enrolledV3(owner, project);
}
