import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { readAppUser } from "@/lib/auth/read-app-user";
import { getCreditWallet } from "@/lib/payments/server";
import { getCreditSummary, getFreeAllowance } from "@/lib/accounting/server";
import { getCreatorEarnings, getMarketplacePurchases } from "@/lib/marketplace/payments/server";
import { getWithdrawalAccount } from "@/lib/marketplace/withdrawals/server";
import { getCreationPreferences } from "@/lib/settings/server";
import { getOwnedCreatorProfile } from "@/lib/marketplace/creators/server";
import { prepareSettingsAccount } from "@/lib/settings/account";
import { getCreditPurchasePricing } from "@/lib/payments/credit-pricing-config";
import { isPayPalConfigured } from "@/lib/payments/paypal/config";
import { getMarketplaceListing, listOwnedMarketplaceListings } from "@/lib/marketplace/server";

const inputSchema = z.strictObject({ resource: z.enum(["credits-config", "wallet", "credit-summary", "allowance", "earnings", "history", "preferences", "profile", "account", "listings"]), page: z.number().int().min(1).max(100000).default(1) });
const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin || Number(request.headers.get("content-length") ?? 0) > 256)
    return Response.json({ error: "Invalid account request." }, { status: 403, headers });
  try {
    const body = await request.text();
    if (body.length > 256) return Response.json({ error: "Invalid account request." }, { status: 400, headers });
    const { resource, page } = inputSchema.parse(JSON.parse(body)), user = await readAppUser();
    let data: unknown;
    switch (resource) {
      case "credits-config": data = { clerkUserId: user.clerk_user_id, pricing: getCreditPurchasePricing(), configured: isPayPalConfigured() }; break;
      case "wallet": data = await getCreditWallet(); break;
      case "credit-summary": data = await getCreditSummary(); break;
      case "allowance": data = await getFreeAllowance(); break;
      case "earnings": {
        const [earnings, withdrawals] = await Promise.all([getCreatorEarnings(page), getWithdrawalAccount(page)]);
        if (earnings.clerkUserId !== user.clerk_user_id || withdrawals.clerkUserId !== user.clerk_user_id) throw new Error("ACCOUNT_CHANGED");
        data = { ...earnings, withdrawals: withdrawals.account }; break;
      }
      case "history": {
        const history = await getMarketplacePurchases(page);
        const previews = await Promise.all([...new Set(history.items.map(item => item.listingId))].map(async id => {
          try { const listing = await getMarketplaceListing(id); return listing ? [id, listing] as const : null; }
          catch (error) { unstable_rethrow(error); return null; }
        }));
        data = { ...history, previews: Object.fromEntries(previews.filter(row => row !== null)) }; break;
      }
      case "preferences": data = await getCreationPreferences(); break;
      case "profile": data = await getOwnedCreatorProfile(); break;
      case "account": data = await prepareSettingsAccount(); break;
      case "listings": data = { ...await listOwnedMarketplaceListings(page), clerkUserId: user.clerk_user_id }; break;
    }
    if (data && typeof data === "object" && "clerkUserId" in data && data.clerkUserId !== user.clerk_user_id) throw new Error("ACCOUNT_CHANGED");
    return Response.json({ clerkUserId: user.clerk_user_id, data }, { headers });
  } catch (error) { unstable_rethrow(error); return Response.json({ error: "Account information couldn’t be refreshed." }, { status: 503, headers }); }
}
