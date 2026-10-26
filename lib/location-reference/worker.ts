import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { deleteR2LocationCandidate } from "@/lib/storage/r2";
import type { LocationRow } from "./contract";
import { locationKey, loadLocation, normalizeLocation, saveLocation } from "./media";
import { createLocationProvider, locationConfig, locationPrompt } from "./provider";

// This executor is called only by LocalJobRunner, never a route or hosted adapter.
export async function runLocation(claim: LocationRow, shutdown: AbortSignal) {
  const db = createDatabaseClient();
  let row = claim; let lost = false;
  const abort = new AbortController();
  const signal = AbortSignal.any([shutdown, abort.signal, AbortSignal.timeout(300_000)]);
  let pending: Promise<unknown> = Promise.resolve();
  const checkpoint = (operation: string, payload: Record<string, unknown> = {}) => {
    const task = pending.then(async () => {
      if (lost) throw new Error("LOCATION_LEASE_LOST");
      const result = await db.rpc("ugc_location_checkpoint", { p_location: row.id, p_token: claim.claim_token!, p_operation: operation, p_payload: payload });
      if (result.error || !result.data) { lost = true; abort.abort(); throw new Error("LOCATION_LEASE_LOST"); }
      row = result.data;
      return row;
    });
    pending = task.catch(() => {});
    return task;
  };
  const heartbeat = setInterval(() => { void checkpoint("heartbeat").catch(() => {}); }, 20_000);
  try {
    if (row.state === "running_plan") {
      if (row.plan_intent) { await checkpoint("fail", { code: "LOCATION_RECONCILIATION_REQUIRED" }); return; }
      const config = locationConfig(); const provider = createLocationProvider();
      signal.throwIfAborted();
      await checkpoint("plan_intent", { provider: "openai", model: config.planModel, contractVersion: 1 });
      const result = await provider.plan(row.scene, config.planModel, signal);
      await checkpoint("plan_ready", result);
      return;
    }
    const candidateResult = await db.from("ugc_location_candidates").select("*").eq("id", row.candidate_id!).eq("location_id", row.id).single();
    if (candidateResult.error || !candidateResult.data) throw new Error("LOCATION_CANDIDATE_UNAVAILABLE");
    const candidate = candidateResult.data;
    if (row.state === "rejecting") {
      // SQL already fenced Accept, preview and all writers. This unique key is never reused.
      if (candidate.state !== "rejecting" || !candidate.artifact || row.accepted_candidate_id === candidate.id ||
        candidate.artifact.storageKey !== locationKey(row, candidate)) throw new Error("LOCATION_DELETE_DENIED");
      await deleteR2LocationCandidate(candidate.artifact.storageKey, candidate.artifact.etag, signal);
      await checkpoint("deleted");
      return;
    }
    if (row.state !== "running_image") throw new Error("LOCATION_STATE_INVALID");
    // A stored output wins over an uncertain synchronous request. Never repay it.
    if (candidate.intent) {
      const stored = await loadLocation(row, candidate, signal);
      if (stored) { await checkpoint("image_ready", { artifact: stored.artifact }); return; }
      await checkpoint("fail", { code: "LOCATION_RECONCILIATION_REQUIRED" }); return;
    }
    const provider = createLocationProvider();
    const prompt = locationPrompt(candidate.plan, row.scene);
    signal.throwIfAborted();
    await checkpoint("image_intent", { prompt, provider: "openai", model: candidate.settings.model, contractVersion: 1 });
    const result = await provider.image(prompt, candidate.settings, signal);
    await checkpoint("saving", { receipt: result.receipt });
    const bytes = await normalizeLocation(result.bytes);
    const artifact = await saveLocation(row, candidate, bytes, signal);
    await checkpoint("image_ready", { artifact });
  } catch (error) {
    if (!lost) {
      const code = error instanceof Error && error.message === "LOCATION_CONFIG_INVALID" ? "LOCATION_CONFIG_INVALID" :
        row.phase === "saving" ? "LOCATION_STORAGE_FAILED" : "LOCATION_RECONCILIATION_REQUIRED";
      await checkpoint("fail", { code }).catch(() => {});
    }
  } finally {
    clearInterval(heartbeat); abort.abort(); await pending;
  }
}
