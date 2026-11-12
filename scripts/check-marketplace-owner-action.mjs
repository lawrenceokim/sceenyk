// Offline owner-action projection only; no checkout, provider or database writes.
import assert from "node:assert/strict";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let actor = "creator", failure = null, lookupFailure = null, checks = 0;
const listingId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const calls = [];
const load = typescriptLoader({
  "next/cache": { revalidatePath() { throw new Error("UNEXPECTED_INVALIDATION"); } },
  "next/navigation": { unstable_rethrow(error) { if (error?.frameworkSignal) throw error; } },
  "@/lib/auth/ensure-app-user": { ensureAppUser: async () => { if (failure) throw failure; return { clerk_user_id: actor }; } },
  "@/lib/marketplace/server": { getOwnedMarketplaceListing: async id => {
    calls.push({ actor, id }); if (lookupFailure) throw lookupFailure;
    return actor === "creator" ? { id, sourceProjectId: "private-project", template: { instructions: "private instructions" } } : null;
  } },
  "@/lib/marketplace/project-template": {},
}, { fetch: async () => { throw new Error("NETWORK_FORBIDDEN"); } });
const { marketplaceListingAccessAction } = load("app/actions/marketplace.ts");
const equal = (a, b) => { assert.equal(JSON.stringify(a), JSON.stringify(b)); checks++; };
equal(await marketplaceListingAccessAction(listingId), { ok: true, clerkUserId: "creator", owned: true });
equal(calls, [{ actor: "creator", id: listingId }]);
actor = "buyer";
equal(await marketplaceListingAccessAction(listingId), { ok: true, clerkUserId: "buyer", owned: false });
failure = new Error("session unavailable");
equal(await marketplaceListingAccessAction(listingId), { ok: false });
equal(calls.length, 2);
failure = null; lookupFailure = new Error("ownership read unavailable");
equal(await marketplaceListingAccessAction(listingId), { ok: false });
lookupFailure = null; failure = { frameworkSignal: true };
await assert.rejects(() => marketplaceListingAccessAction(listingId), error => error === failure); checks++;
console.log(JSON.stringify({ checks, realNetworkCalls: 0, paidRequests: 0 }));
