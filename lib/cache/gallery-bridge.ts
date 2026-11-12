import { accountSessionCache } from "./account-cache";
import { projectsSessionCache } from "@/lib/projects/session-cache";
import { templatesSessionCache } from "@/lib/templates/session-cache";
import { marketplaceSessionCache } from "@/lib/marketplace/session-cache";
import { purchasesSessionCache } from "@/lib/purchases/session-cache";

// Keep the existing gallery/media instances, snapshots and expiry mechanisms.
// Mutation reconciliation reads metadata only; hidden cards never start video.
for (const [domain, cache] of [
  ["projects", projectsSessionCache], ["templates", templatesSessionCache],
  ["marketplace", marketplaceSessionCache], ["purchases", purchasesSessionCache],
] as const) {
  accountSessionCache.register(domain, {
    invalidate: scope => cache.invalidateAll(scope),
    refresh: (scope, viewer) => cache.refreshCached(scope, viewer),
    reset: scope => cache.setScope(domain === "marketplace" ? scope ?? "public" : scope),
  });
}
