import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { processWithdrawal } from "@/lib/marketplace/withdrawals/server";
import { inngest } from "./client";

// A transactional DB outbox is implicit in persistent due withdrawals. Cron
// recovers even if the browser/server disappears immediately after reservation.
export const creatorPayoutReconciliation = inngest.createFunction({
  id: "creator-payout-reconciliation", triggers: { cron: "* * * * *" }, retries: 4, concurrency: 1,
}, async ({ step }) => {
  const ids = await step.run("load-due-creator-withdrawals", async () => {
    const r = await createDatabaseClient().rpc("creator_payout_candidates");
    if (r.error) throw new Error("CREATOR_WITHDRAWAL_UNAVAILABLE");
    return z.array(z.uuid()).max(5).parse(r.data);
  });
  let deferred = 0;
  for (const id of ids) {
    const result = await step.run(`reconcile-withdrawal-${id}`, async () => {
      try { return await processWithdrawal(id); }
      catch { return "deferred"; } // Persistent due time lets the next cron recover.
    });
    if (result === "deferred") deferred++;
  }
  return { inspected: ids.length, deferred };
});
