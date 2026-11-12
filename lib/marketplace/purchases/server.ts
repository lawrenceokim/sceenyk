import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { readAppUser } from "@/lib/auth/read-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { projectPageSchema } from "@/lib/projects/validation";
import { listingSchema, type MarketplaceResult } from "../contract";
import { MarketplaceAccessError } from "../server";
import { acquisitionSchema, acquisitionPageSchema, type Acquisition } from "./contract";

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new MarketplaceAccessError();
  return result.data;
}
async function identities(items: Acquisition[]) {
  if (!items.length) return items;
  const raw = checked(await createDatabaseClient().rpc("creator_profile_listing_identities", { p_ids: [...new Set(items.map(item => item.listingId))] }));
  const rows = z.array(z.strictObject({ id: z.uuid(), creatorName: listingSchema.shape.creatorName,
    creatorSlug: listingSchema.shape.creatorSlug, creatorAvatar: listingSchema.shape.creatorAvatar })).parse(raw);
  const byId = new Map(rows.map(row => [row.id, row]));
  return items.map(item => {
    const identity = byId.get(item.listingId);
    return identity ? { ...item, creatorName: identity.creatorName, creatorSlug: identity.creatorSlug, creatorAvatar: identity.creatorAvatar } : item;
  });
}

// Every exported operation resolves the account itself; browser IDs never supply ownership.
export async function getAcquiredTemplates(page: unknown = 1) {
  const user = await readAppUser();
  const result = acquisitionPageSchema.parse(checked(await createDatabaseClient().rpc("marketplace_acquisition_library", {
    p_owner: user.id, p_page: projectPageSchema.parse(page),
  })));
  return { ...result, items: await identities(result.items), clerkUserId: user.clerk_user_id };
}
export async function getAcquiredTemplate(input: unknown) {
  const user = await readAppUser();
  const id = z.uuid().safeParse(input);
  if (!id.success) return null;
  const raw = checked(await createDatabaseClient().rpc("marketplace_acquisition_detail", { p_owner: user.id, p_id: id.data }));
  if (!raw) return null;
  const [purchase] = await identities([acquisitionSchema.parse(raw)]);
  return { purchase, clerkUserId: user.clerk_user_id };
}
export async function getAcquiredTemplatePreview(input: unknown) {
  const user = await readAppUser();
  const id = z.uuid().safeParse(input);
  if (!id.success) return null;
  const raw = checked(await createDatabaseClient().rpc("marketplace_acquisition_preview", { p_owner: user.id, p_id: id.data }));
  if (!raw) return null;
  const preview = z.strictObject({ listingId: z.uuid(), key: z.string(), etag: z.string().min(1), size: z.number().int().min(1).max(524288) }).parse(raw);
  if (!new RegExp(`^marketplace-previews/${preview.listingId}/[a-f0-9-]{36}\\.webp$`).test(preview.key)) throw new MarketplaceAccessError();
  return preview;
}
export async function openAcquiredTemplate(input: unknown): Promise<MarketplaceResult> {
  const user = await ensureAppUser();
  const id = z.uuid().safeParse(input);
  if (!id.success) return { ok: false, code: "INVALID_INPUT", message: "Choose a template from your purchases." };
  const value = z.object({ code: z.enum(["ADOPTED", "NOT_FOUND"]), projectId: z.uuid().optional() }).parse(
    checked(await createDatabaseClient().rpc("marketplace_open_acquisition", { p_owner: user.id, p_id: id.data })));
  return value.code === "ADOPTED" && value.projectId
    ? { ok: true, projectId: value.projectId }
    : { ok: false, code: "NOT_FOUND", message: "This purchase is unavailable. Return to your purchases and try again." };
}
