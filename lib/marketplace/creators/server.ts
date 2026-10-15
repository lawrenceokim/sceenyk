import "server-only";
import { connection } from "next/server";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { listingSchema } from "../contract";
import { withEstimate } from "../server";
import { creatorProfile, creatorSlug, normalizeCreatorSlug, profileInput } from "./contract";

export class CreatorProfileError extends Error {
  constructor(readonly code = "UNAVAILABLE", message = "Your public profile couldn’t be saved. Please try again.") { super(message); }
}
function checked<T>(result: { data: T | null; error: unknown }): T | null {
  if (result.error) throw new CreatorProfileError();
  return result.data;
}
export async function getOwnedCreatorProfile() {
  const user = await ensureAppUser();
  const data = checked(await createDatabaseClient().rpc("creator_profile_owned", { p_owner: user.id }));
  return { clerkUserId: user.clerk_user_id, profile: data ? creatorProfile.parse(data) : null };
}
export async function saveCreatorProfile(input: unknown) {
  const user = await ensureAppUser();
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) throw new CreatorProfileError("INVALID_INPUT", parsed.error.issues[0].message);
  const value = parsed.data;
  const result = z.object({ code: z.string(), profile: creatorProfile.optional() }).parse(checked(await createDatabaseClient().rpc("creator_profile_save", {
    p_owner: user.id, p_name: value.displayName, p_bio: value.bio, p_slug: value.slug === null ? null : normalizeCreatorSlug(value.slug),
  })));
  if (result.code === "SLUG_FIXED") throw new CreatorProfileError("SLUG_FIXED", "Your public URL stays fixed after setup. You can still edit your name and bio.");
  if (result.code === "SLUG_UNAVAILABLE") throw new CreatorProfileError("SLUG_UNAVAILABLE", "This public URL is unavailable. Choose a different slug.");
  if (result.code !== "SAVED" || !result.profile) throw new CreatorProfileError("INVALID_INPUT", "Check your public name, bio and initial slug.");
  return result.profile;
}
const storefrontSchema = z.strictObject({ profile: creatorProfile, adoptionCount: z.number().int().nonnegative(), items: z.array(listingSchema), total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.literal(12) });
export async function getCreatorStorefront(slug: unknown, page = 1) {
  await connection();
  const parsed = creatorSlug.safeParse(slug);
  if (!parsed.success) return null;
  z.number().int().min(1).max(100000).parse(page);
  const data = checked(await createDatabaseClient().rpc("creator_storefront", { p_slug: parsed.data, p_page: page }));
  if (!data) return null;
  const result = storefrontSchema.parse(data);
  return { ...result, items: result.items.map(withEstimate) };
}
export async function removeCreatorAvatar() {
  const user = await ensureAppUser();
  return creatorProfile.parse(checked(await createDatabaseClient().rpc("creator_profile_avatar_save", { p_owner: user.id, p_key: null, p_etag: null, p_size: null })));
}
