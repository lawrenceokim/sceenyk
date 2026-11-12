"use server";

import { unstable_rethrow } from "next/navigation";
import { openAcquiredTemplate } from "@/lib/marketplace/purchases/server";
import type { MarketplaceResult } from "@/lib/marketplace/contract";

export async function openPurchaseProjectAction(input: unknown): Promise<MarketplaceResult> {
  try {
    const result = await openAcquiredTemplate(input);
    return result;
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false, code: "UNAVAILABLE", message: "Your project couldn’t be opened. Try again to recover the same version." };
  }
}
