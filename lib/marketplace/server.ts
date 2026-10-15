import "server-only";
import { z } from "zod";
import { connection } from "next/server";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { quoteGenerationCost } from "@/lib/pricing/config";
import { validateMarketplacePrice } from "./payments/config";
import {
  adoptListingSchema, browseSchema, createListingSchema, listingSchema,
  originSchema, ownedListingSchema, updateListingSchema,
  type Listing, type ListingPage, type MarketplaceResult, type OwnedListing, type TemplateSnapshot,
} from "./contract";

export class MarketplaceAccessError extends Error {
  constructor() { super("Marketplace couldn’t be loaded. Please try again."); this.name = "MarketplaceAccessError"; }
}
function estimate(template: TemplateSnapshot): Listing["estimate"] {
  try {
    const cost = quoteGenerationCost({ version: 1, prompt: template.instructions, category: template.category, settings: template.settings, assetIds: [] });
    return cost.requiredCredits === null ? null : { credits: cost.requiredCredits, test: cost.pricingMode === "test" };
  } catch { return null; } // An unavailable estimate cannot authorize or block adoption.
}
function checked<T>(data: T | null, error: { code?: string } | null): T {
  if (error || data === null) {
    console.error("Marketplace database operation failed.", { code: error?.code && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : "UNAVAILABLE" });
    throw new MarketplaceAccessError();
  }
  return data;
}
export function withEstimate<T extends z.infer<typeof listingSchema>>(listing: T) { return { ...listing, estimate: estimate(listing.template) }; }
const pageFields = { total: z.number().int().nonnegative(), page: z.number().int().positive(), pageSize: z.literal(12) };
async function withCreatorIdentities<T extends z.infer<typeof listingSchema>>(listings: T[]) {
  if (!listings.length) return listings;
  const result = await createDatabaseClient().rpc("creator_profile_listing_identities", { p_ids: listings.map(l => l.id) });
  const identities = z.array(z.strictObject({ id: listingSchema.shape.id, creatorName: listingSchema.shape.creatorName, creatorSlug: listingSchema.shape.creatorSlug, creatorAvatar: listingSchema.shape.creatorAvatar })).parse(checked(result.data, result.error));
  const byListing = new Map(identities.map(identity => [identity.id, identity]));
  return listings.map(listing => ({ ...listing, ...byListing.get(listing.id) }));
}

export async function browseMarketplace(input: unknown = {}): Promise<ListingPage> {
  await connection();
  const parsed = browseSchema.parse(input);
  const { data, error } = await createDatabaseClient().rpc("marketplace_browse", { p_query: parsed.query, p_category: parsed.category, p_page: parsed.page });
  const page = z.object({ ...pageFields, items: z.array(listingSchema) }).parse(checked(data, error));
  return { ...page, items: (await withCreatorIdentities(page.items)).map(withEstimate) };
}
export async function getMarketplaceListing(input: unknown): Promise<Listing | null> {
  await connection();
  const id = z.uuid().safeParse(input);
  if (!id.success) return null;
  const { data, error } = await createDatabaseClient().rpc("marketplace_detail", { p_listing_id: id.data });
  if (error) checked(data, error);
  return data ? withEstimate((await withCreatorIdentities([listingSchema.parse(data)]))[0]) : null;
}
export async function listOwnedMarketplaceListings(input: unknown = 1): Promise<ListingPage<OwnedListing>> {
  const user = await ensureAppUser();
  const pageNumber = browseSchema.shape.page.parse(input);
  const { data, error } = await createDatabaseClient().rpc("marketplace_owned", { p_owner_user_id: user.id, p_page: pageNumber });
  const page = z.object({ ...pageFields, items: z.array(ownedListingSchema) }).parse(checked(data, error));
  return { ...page, items: (await withCreatorIdentities(page.items)).map(withEstimate) };
}
export async function getOwnedMarketplaceListing(input: unknown, byProject = false): Promise<OwnedListing | null> {
  const user = await ensureAppUser();
  const id = z.uuid().safeParse(input);
  if (!id.success) return null;
  const { data, error } = await createDatabaseClient().rpc("marketplace_owned_listing", {
    p_owner_user_id: user.id, p_listing_id: byProject ? null : id.data, p_project_id: byProject ? id.data : null,
  });
  if (error) checked(data, error);
  return data ? withEstimate((await withCreatorIdentities([ownedListingSchema.parse(data)]))[0]) : null;
}
export async function getOwnedProjectOrigin(input: unknown) {
  const user = await ensureAppUser();
  const id = z.uuid().safeParse(input);
  if (!id.success) return null;
  const { data, error } = await createDatabaseClient().rpc("marketplace_origin", { p_owner_user_id: user.id, p_project_id: id.data });
  if (error) checked(data, error);
  return data ? originSchema.parse(data) : null;
}
function mutationResult(data: unknown, error: { code?: string } | null): MarketplaceResult {
  if (error) { checked(data, error); }
  const parsed = z.object({ code: z.string(), listingId: z.uuid().optional(), projectId: z.uuid().optional() }).safeParse(data);
  if (!parsed.success) throw new MarketplaceAccessError();
  const value = parsed.data;
  if ((value.code === "SAVED" || value.code === "EXISTS") && value.listingId) return { ok: true, listingId: value.listingId, existing: value.code === "EXISTS" };
  if (value.code === "ADOPTED" && value.projectId) return { ok: true, projectId: value.projectId };
  if (value.code === "NOT_FOUND") return { ok: false, code: "NOT_FOUND", message: "This project or listing is unavailable." };
  if (value.code === "CONFLICT") return { ok: false, code: "CONFLICT", message: "This adoption request belongs to a different listing. Reopen this page to try again." };
  if (value.code === "PAYMENT_REQUIRED") return { ok: false, code: "CONFLICT", message: "This template requires a verified Marketplace purchase before adoption." };
  return { ok: false, code: "INVALID_INPUT", message: "Check the listing details, status and rights confirmation." };
}
export async function createMarketplaceListing(input: unknown): Promise<MarketplaceResult> {
  const user = await ensureAppUser();
  const parsed = createListingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0].message };
  const v = parsed.data;
  try { validateMarketplacePrice(v.adoptionType, v.priceMinor); } catch { return { ok: false, code: "INVALID_INPUT", message: "Choose Free or a Sandbox price from $1.00 to $25.00." }; }
  const { data, error } = await createDatabaseClient().rpc("marketplace_create_priced", {
    p_owner_user_id: user.id, p_listing_id: v.id, p_project_id: v.sourceProjectId, p_title: v.title,
    p_description: v.description, p_category: v.category, p_tags: v.tags, p_instructions: v.instructions,
    p_publish: v.publish, p_rights_confirmed: v.rightsConfirmed,
    p_adoption_type: v.adoptionType, p_price_minor: v.priceMinor,
  });
  return mutationResult(data, error);
}
export async function updateMarketplaceListing(input: unknown): Promise<MarketplaceResult> {
  const user = await ensureAppUser();
  const parsed = updateListingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: parsed.error.issues[0].message };
  const v = parsed.data;
  try { validateMarketplacePrice(v.adoptionType, v.priceMinor); } catch { return { ok: false, code: "INVALID_INPUT", message: "Choose Free or a Sandbox price from $1.00 to $25.00." }; }
  const { data, error } = await createDatabaseClient().rpc("marketplace_update_priced", {
    p_owner_user_id: user.id, p_listing_id: v.id, p_title: v.title, p_description: v.description,
    p_category: v.category, p_tags: v.tags, p_status: v.status, p_rights_confirmed: v.rightsConfirmed,
    p_adoption_type: v.adoptionType, p_price_minor: v.priceMinor,
  });
  return mutationResult(data, error);
}
export async function adoptMarketplaceListing(input: unknown): Promise<MarketplaceResult> {
  const user = await ensureAppUser();
  const parsed = adoptListingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: "INVALID_INPUT", message: "Reopen the listing and try adopting again." };
  const { data, error } = await createDatabaseClient().rpc("marketplace_adopt", { p_owner_user_id: user.id, p_listing_id: parsed.data.listingId, p_request_id: parsed.data.requestId });
  return mutationResult(data, error);
}
