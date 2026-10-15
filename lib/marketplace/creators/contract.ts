import { z } from "zod";

const privateReference = /https?:\/\/|www\.|users\/|x-amz-|sb_secret_|sk_live_|sk_test_|bearer\s|user_[a-z0-9]{10}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i;
const publicText = (max: number) => z.string().trim().max(max).refine(v => !privateReference.test(v), "Remove email, links, private IDs and access details from public text.");
export const creatorSlug = z.string().min(1).max(64).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
export const profileInput = z.strictObject({ displayName: publicText(80).min(1), bio: publicText(500), slug: publicText(64).nullable() });
export const creatorProfile = z.strictObject({
  slug: creatorSlug, displayName: publicText(80).min(1), bio: publicText(500), creatorSince: z.string(),
  avatarUrl: z.string().regex(/^\/api\/marketplace\/creators\/[a-z0-9]+(?:-[a-z0-9]+)*\/avatar$/).nullable(),
}).refine(p => !p.avatarUrl || p.avatarUrl === `/api/marketplace/creators/${p.slug}/avatar`);
export type CreatorProfile = z.infer<typeof creatorProfile>;
export function normalizeCreatorSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "") || "creator";
}
export const avatarMaximumBytes = 2 * 1024 * 1024;
export const avatarMimeTypes = ["image/jpeg", "image/png", "image/webp"] as const;
