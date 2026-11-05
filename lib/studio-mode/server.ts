import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { studioModeInputSchema, studioModeStateSchema } from "./contract";

export async function readStudioMode(input: unknown) {
  const user = await ensureAppUser();
  const projectId = z.uuid().nullable().parse(input);
  const { data, error } = await createDatabaseClient().rpc("studio_mode_read", {
    p_owner: user.id, p_project: projectId,
  });
  if (error || !data) throw new Error("STUDIO_MODE_UNAVAILABLE");
  return { ...studioModeStateSchema.parse(data), clerkUserId: user.clerk_user_id };
}

export async function saveStudioMode(input: unknown) {
  const user = await ensureAppUser();
  const { projectId, mode } = studioModeInputSchema.parse(input);
  const { data, error } = await createDatabaseClient().rpc("studio_mode_save", {
    p_owner: user.id, p_project: projectId, p_mode: mode,
  });
  if (error || !data) throw new Error("STUDIO_MODE_UNAVAILABLE");
  return { ...studioModeStateSchema.parse(data), clerkUserId: user.clerk_user_id };
}
