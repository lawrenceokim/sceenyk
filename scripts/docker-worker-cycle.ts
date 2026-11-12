// Compiled at image build time; never load the laptop's .env.local here.
import { promises as fs } from "node:fs";
import { z } from "zod";
import { createDatabaseClient } from "../lib/db/server";
import { getPayPalConfig } from "../lib/payments/paypal/config";
import { v3WorkerFailure } from "../lib/final-video-generation-v3/connection-recovery";

async function generationCycle(lane: "ugc" | "media") {
  const { V3Store } = await import("../lib/final-video-generation-v3/runtime-store");
  const { processV3QueueBatch } = await import("../lib/final-video-generation-v3/background-worker");
  const { runV3Task } = await import("../lib/final-video-generation-v3/worker");
  const { v3OwnedAccessEnabled } = await import("../lib/final-video-generation-v3/runtime-config");
  if (!v3OwnedAccessEnabled()) throw new Error("V3_OWNED_WORKER_CONFIGURATION_REQUIRED");
  const store = new V3Store(), cursorFile = `/tmp/${lane}-cursor.json`;
  let after: string | null = null;
  try { after = z.uuid().nullable().parse(JSON.parse(await fs.readFile(cursorFile, "utf8"))); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  let processed: string | null = null;
  const signal = AbortSignal.timeout(14 * 60_000);
  const result = await processV3QueueBatch(store, { after, ownerId: null, concurrency: 1, signal }, async project => {
    if (processed) return;
    if (await runV3Task(project.project_id, project.owner_user_id, store, signal, lane)) processed = project.project_id;
  });
  await fs.writeFile(cursorFile, JSON.stringify(processed ?? result.after), { mode: 0o600 });
  if (result.failures.length) {
    // Preserve the classified failure. Never retry an individual claim, charge,
    // checkpoint or provider POST after a lost acknowledgement.
    for (const failure of result.failures) console.error("DOCKER_V3_PROJECT_FAILURE", JSON.stringify(failure));
    process.exitCode = result.failures.every(f => f.diagnostic?.service === "database" && f.diagnostic.retryable) ? 75 : 1;
    return;
  }
  if (lane === "media") {
    const { processProjectVideoPreview } = await import("../lib/projects/video-preview-worker");
    await processProjectVideoPreview();
  }
}

async function payoutCycle() {
  // Same Sandbox-only config, verified processor and immutable SQL eligibility as the app.
  getPayPalConfig();
  if (process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED !== "sandbox-confirmed") throw new Error("SANDBOX_PAYOUT_ACTIVATION_REQUIRED");
  const { processWithdrawal } = await import("../lib/marketplace/withdrawals/processor");
  const db = createDatabaseClient(), seen = new Set<string>();
  let deferred = 0;
  // Up to 100 due withdrawals per hourly pass, sequentially. No immediate financial retries.
  for (let batch = 0; batch < 20; batch++) {
    const result = await db.rpc("creator_payout_candidates");
    if (result.error) throw new Error("CREATOR_WITHDRAWAL_UNAVAILABLE");
    const ids = z.array(z.uuid()).max(5).parse(result.data).filter(id => !seen.has(id));
    if (!ids.length) break;
    for (const id of ids) {
      seen.add(id);
      try { await processWithdrawal(id); }
      catch { deferred++; }
    }
  }
  console.info(JSON.stringify({ stage: "SANDBOX_PAYOUT_CHECK_COMPLETE", inspected: seen.size, deferred }));
  if (deferred) throw new Error("SANDBOX_PAYOUT_CHECK_DEFERRED");
}

async function main() {
  if (process.env.SCEENYK_DOCKER_WORKERS_ENABLED !== "1" || process.env.PAYPAL_ENVIRONMENT !== "sandbox") throw new Error("DOCKER_WORKER_ACTIVATION_REQUIRED");
  const lane = z.enum(["ugc", "media", "payout"]).parse(process.argv[2]);
  if (lane === "payout") await payoutCycle(); else await generationCycle(lane);
}
void main().catch(error => {
  const failure = v3WorkerFailure(error);
  console.error("DOCKER_WORKER_CYCLE_FAILURE", JSON.stringify(failure));
  // EX_TEMPFAIL is consumed by the supervisor, not a blanket RPC retry policy.
  // Payouts and all permanent/configuration failures retain stop behavior.
  process.exitCode = process.argv[2] !== "payout" && failure.diagnostic?.service === "database" && failure.diagnostic.retryable ? 75 : 1;
});
