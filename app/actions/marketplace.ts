"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { adoptMarketplaceListing, createMarketplaceListing, updateMarketplaceListing } from "@/lib/marketplace/server";
import type { MarketplaceResult } from "@/lib/marketplace/contract";

async function run(work: () => Promise<MarketplaceResult>): Promise<MarketplaceResult> {
  try {
    const result = await work();
    if (result.ok) {
      revalidatePath("/marketplace", "layout");
      revalidatePath("/dashboard/marketplace");
      if ("projectId" in result) revalidatePath("/dashboard");
    }
    return result;
  } catch (error: unknown) {
    unstable_rethrow(error);
    return { ok: false, code: "UNAVAILABLE", message: "Marketplace couldn’t save this change. Check your connection and try again." };
  }
}
export async function createMarketplaceAction(input: unknown) { return run(() => createMarketplaceListing(input)); }
export async function updateMarketplaceAction(input: unknown) { return run(() => updateMarketplaceListing(input)); }
export async function adoptMarketplaceAction(input: unknown) { return run(() => adoptMarketplaceListing(input)); }
