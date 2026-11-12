"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { adoptMarketplaceListing, createMarketplaceListing, deleteOwnedTemplate, getOwnedMarketplaceListing, updateMarketplaceListing } from "@/lib/marketplace/server";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import type { MarketplaceResult } from "@/lib/marketplace/contract";
import { getOwnedTemplateSource, initializeProjectTemplate } from "@/lib/marketplace/project-template";

async function run(work: () => Promise<MarketplaceResult>): Promise<MarketplaceResult> {
  try {
    const result = await work();
    if (result.ok) {
      if ("listingId" in result) {
        revalidatePath(`/marketplace/${result.listingId}`);
        revalidatePath(`/templates/${result.listingId}`);
        revalidatePath(`/settings/templates/${result.listingId}`);
      }
    }
    return result;
  } catch (error: unknown) {
    unstable_rethrow(error);
    return { ok: false, code: "UNAVAILABLE", message: "Marketplace couldn’t save this change. Check your connection and try again." };
  }
}
export async function createMarketplaceAction(input: unknown) { return run(() => createMarketplaceListing(input)); }
export async function updateMarketplaceAction(input: unknown, preview?: FormData) { return run(() => updateMarketplaceListing(input, preview)); }
export async function initializeTemplateAction(projectId: unknown) { return run(() => initializeProjectTemplate(projectId)); }
export async function readTemplateSourceAction(listingId: unknown) {
  try { return await getOwnedTemplateSource(listingId); }
  catch (error) { unstable_rethrow(error); throw new Error("The template preview couldn’t be loaded."); }
}
export async function adoptMarketplaceAction(input: unknown) { return run(() => adoptMarketplaceListing(input)); }
export async function deleteTemplateAction(input: unknown) { return run(() => deleteOwnedTemplate(input)); }

// Return only the viewer's ownership result, never the private listing snapshot.
// This read must not invalidate the public route or start a checkout.
export async function marketplaceListingAccessAction(listingId: unknown): Promise<
  { ok: true; clerkUserId: string; owned: boolean } | { ok: false }
> {
  try {
    const user = await ensureAppUser();
    const listing = await getOwnedMarketplaceListing(listingId);
    return { ok: true, clerkUserId: user.clerk_user_id, owned: !!listing };
  } catch (error) { unstable_rethrow(error); return { ok: false }; }
}
