import "server-only";
import type { createDatabaseClient } from "@/lib/db/server";

// Internal helper: callers first derive the authenticated owner/project context.
export async function readOwnedUgcV1References(database: ReturnType<typeof createDatabaseClient>, ownerId: string, projectId: string) {
  const { data, error } = await database.from("project_assets").select("id,studio_role")
    .eq("owner_user_id", ownerId).eq("project_id", projectId).eq("removed_from_draft", false)
    .in("studio_role", ["character", "product"]);
  if (error || !data) return null;
  return {
    characters: data.filter(asset => asset.studio_role === "character"),
    products: data.filter(asset => asset.studio_role === "product"),
  };
}
