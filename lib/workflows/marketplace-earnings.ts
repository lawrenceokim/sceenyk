import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { reconcileMarketplaceFinancials } from "@/lib/marketplace/earnings/server";
import { inngest } from "./client";

export const marketplaceEarningsReconciliation = inngest.createFunction({
  id: "marketplace-earnings-reconciliation", triggers: { cron: "* * * * *" }, retries: 4, concurrency: 1,
}, async ({ step }) => {
  const candidates = await step.run("load-marketplace-financial-candidates", async () => {
    const result = await createDatabaseClient().rpc("marketplace_financial_candidates");
    if (result.error) throw new Error("MARKETPLACE_ACCOUNTING_UNAVAILABLE");
    return z.array(z.uuid()).max(5).parse(result.data);
  });
  let deferred = 0;
  for (const id of candidates) {
    const result = await step.run(`reconcile-${id}`, async () => {
      try { await reconcileMarketplaceFinancials(id); return true; }
      catch { return false; } // Next scheduled pass retries; no provider bodies logged.
    });
    if (!result) deferred++;
  }
  return { inspected: candidates.length, deferred };
});
