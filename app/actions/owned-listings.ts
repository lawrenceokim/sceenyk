"use server";

import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { browseSchema } from "@/lib/marketplace/contract";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";

export async function loadOwnedListingsAction(input: unknown) {
  const parsed = browseSchema.shape.page.safeParse(input);
  if (!parsed.success) return { ok: false as const, message: "Invalid listing page." };
  try {
    const user = await ensureAppUser();
    const page = await listOwnedMarketplaceListings(parsed.data);
    return { ok: true as const, clerkUserId: user.clerk_user_id, page };
  } catch (error) {
    unstable_rethrow(error);
    return { ok: false as const, message: "More templates couldn’t be loaded. Please try again." };
  }
}
