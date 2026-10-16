import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { creationPreferencesSchema, defaultCreationPreferences } from "./contract";

export async function getCreationPreferences() {
  const user = await ensureAppUser();
  const { data, error } = await createDatabaseClient().rpc("creation_preferences_read", { p_owner: user.id });
  if (error) throw new Error("PREFERENCES_UNAVAILABLE");
  return { clerkUserId: user.clerk_user_id, preferences: data === null ? defaultCreationPreferences : creationPreferencesSchema.parse(data) };
}

export async function saveCreationPreferences(input: unknown) {
  const user = await ensureAppUser();
  const preferences = creationPreferencesSchema.parse(input);
  const { data, error } = await createDatabaseClient().rpc("creation_preferences_save", { p_owner: user.id, p_aspect_ratio: preferences.aspectRatio, p_category: preferences.category });
  if (error || !data) throw new Error("PREFERENCES_UNAVAILABLE");
  return { clerkUserId: user.clerk_user_id, preferences: creationPreferencesSchema.parse(data) };
}
