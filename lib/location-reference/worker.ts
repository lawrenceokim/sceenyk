import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import type { LocationRow } from "./contract";
import { locationOutputProof, normalizeLocation, saveLocation } from "./media";
import { createLocationProvider, locationConfig, locationPrompt } from "./provider";
import { recoverLocationOutput } from "./recovery";
import { stageLocationBytes } from "./spool";
import { locationFailure } from "./errors";
import { deleteLocationOutput } from "./cleanup";
import { compositeRecord, parseWorkerClaim, type LocalExecutionResult } from "@/lib/ugc-jobs/claim-contract";

// This executor is called only by LocalJobRunner, never a route or hosted adapter.
export async function runLocation(claim: LocationRow, shutdown: AbortSignal): Promise<LocalExecutionResult> {
  // Reject empty, expired and approved/nonrunnable records before DB/R2/provider I/O.
  if (!parseWorkerClaim("location", claim)) return { ok: true };
  const db = createDatabaseClient();
  let row = claim; let lost = false;
  let phase = "claim_validation";
  const abort = new AbortController();
  const signal = AbortSignal.any([shutdown, abort.signal, AbortSignal.timeout(300_000)]);
  let pending: Promise<unknown> = Promise.resolve();
  const checkpoint = (operation: string, payload: Record<string, unknown> = {}) => {
    const task = pending.then(async () => {
      if (lost) throw new Error("LOCATION_LEASE_LOST");
      let result;
      try { result = await db.rpc("ugc_location_checkpoint", { p_location: row.id, p_token: claim.claim_token!, p_operation: operation, p_payload: payload }); }
      catch (error) { lost = true; abort.abort(); throw locationFailure(error, `checkpoint_${operation}`, "LOCATION_DATABASE_FAILED"); }
      const committed = compositeRecord(result.data);
      if (result.error || !committed?.id || committed.id !== row.id || committed.job_id !== row.job_id || committed.project_id !== row.project_id) {
        lost = true; abort.abort();
        throw locationFailure(result.error, `checkpoint_${operation}`, result.error ? "LOCATION_DATABASE_FAILED" : "LOCATION_LEASE_LOST");
      }
      row = committed as unknown as LocationRow;
      return row;
    });
    pending = task.catch(() => {});
    return task;
  };
  const heartbeat = setInterval(() => { void checkpoint("heartbeat").catch(() => {}); }, 20_000);
  try {
    if (row.state === "running_plan") {
      phase = "planning";
      if (row.plan_intent) { await checkpoint("fail", { code: "LOCATION_RECONCILIATION_REQUIRED" }); return { ok: false, category: "failed", failureSaved: true }; }
      const config = locationConfig(); const provider = createLocationProvider();
      signal.throwIfAborted();
      await checkpoint("plan_intent", { provider: "openai", model: config.planModel, contractVersion: 1 });
      const result = await provider.plan(row.scene, config.planModel, signal);
      // 064 atomically saves the private plan and queues its image. No browser
      // review round trip; the same local worker claims the image on its next poll.
      await checkpoint("plan_ready", result);
      return { ok: true };
    }
    phase = "candidate_read";
    const candidateResult = await db.from("ugc_location_candidates").select("*").eq("id", row.candidate_id!).eq("location_id", row.id).single();
    if (candidateResult.error) throw locationFailure(candidateResult.error, phase, "LOCATION_DATABASE_FAILED");
    if (!candidateResult.data) throw locationFailure(null, phase, "LOCATION_CANDIDATE_UNAVAILABLE");
    const candidate = candidateResult.data;
    if (row.state === "rejecting") {
      phase = "deleting";
      // SQL already fenced Accept, preview and all writers. This unique key is never reused.
      await deleteLocationOutput(row, signal, checkpoint);
      return { ok: true };
    }
    if (row.state !== "running_image") throw new Error("LOCATION_STATE_INVALID");
    // A stored output wins over an uncertain synchronous request. Never repay it.
    if (candidate.intent) {
      phase = "recovering";
      await recoverLocationOutput(row, signal, checkpoint);
      return { ok: true };
    }
    const provider = createLocationProvider();
    const prompt = locationPrompt(candidate.plan, row.scene);
    signal.throwIfAborted();
    await checkpoint("image_intent", { prompt, provider: "openai", model: candidate.settings.model, contractVersion: 1 });
    phase = "provider_image";
    const result = await provider.image(prompt, candidate.settings, signal);
    phase = "technical_validation";
    const bytes = await normalizeLocation(result.bytes);
    phase = "local_recovery";
    await stageLocationBytes(row, candidate, bytes);
    const proof = await locationOutputProof(candidate, bytes);
    phase = "saving";
    await checkpoint("saving", { receipt: result.receipt, outputProof: proof });
    const artifact = await saveLocation(row, { ...candidate, output_proof: proof }, bytes, signal);
    await checkpoint("image_ready", { artifact });
    return { ok: true };
  } catch (error) {
    const code = error instanceof Error && error.message === "LOCATION_CONFIG_INVALID" ? "LOCATION_CONFIG_INVALID" :
      phase === "deleting" ? "LOCATION_DELETE_FAILED" : phase === "local_recovery" ? "LOCATION_LOCAL_RECOVERY_FAILED" :
        phase === "technical_validation" ? "LOCATION_IMAGE_INVALID" : phase === "provider_image" || phase === "planning" ? "LOCATION_RECONCILIATION_REQUIRED" :
          phase === "candidate_read" ? "LOCATION_DATABASE_FAILED" : "LOCATION_STORAGE_FAILED";
    const failure = locationFailure(error, phase, code);
    let failureSaved = false;
    if (!lost) { try { await checkpoint("fail", { code: failure.code, diagnostic: failure.diagnostic }); failureSaved = true; } catch {} }
    console.error("UGC_LOCATION_TECHNICAL_FAILURE", JSON.stringify({ ...failure.diagnostic, projectId: claim.project_id, jobId: claim.job_id,
      locationId: claim.id, revision: claim.revision, version: claim.version, claimed: true,
      retryState: failureSaved ? "manual_retry_required" : "lease_recovery_fenced", failureSaved }));
    return { ok: false, category: lost ? "lease_lost" : "failed", failureSaved };
  } finally {
    clearInterval(heartbeat); abort.abort(); await pending;
  }
}
