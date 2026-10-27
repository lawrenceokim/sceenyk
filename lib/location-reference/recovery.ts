import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import type { LocationRow } from "./contract";
import { LocationError, locationFailure } from "./errors";
import { loadLocation, locationOutputProof, saveLocation } from "./media";
import { readLocationBytes } from "./spool";
import { deleteLocationOutput } from "./cleanup";
import { compositeRecord, parseWorkerClaim } from "@/lib/ugc-jobs/claim-contract";

export type LocationCheckpoint = (operation: string, payload?: Record<string, unknown>) => Promise<LocationRow>;
// Deliberately imports no provider module. This path can only reuse R2/local bytes.
export async function recoverLocationOutput(row: LocationRow, signal: AbortSignal, checkpoint: LocationCheckpoint) {
  const result = await createDatabaseClient().from("ugc_location_candidates").select("*").eq("id", row.candidate_id!).eq("location_id", row.id).single();
  if (result.error || !result.data || result.data.state !== "submitted" || !result.data.intent) throw new LocationError("LOCATION_RECOVERY_INVALID", "recovering");
  const candidate = result.data;
  await checkpoint("recovering");
  const stored = await loadLocation(row, candidate, signal);
  if (stored) { await checkpoint("image_ready", { artifact: stored.artifact }); return; }
  const bytes = await readLocationBytes(row, candidate);
  if (!bytes) throw new LocationError(candidate.receipt ? "LOCATION_OUTPUT_UNAVAILABLE" : "LOCATION_RECONCILIATION_REQUIRED", "recovering");
  const proof = await locationOutputProof(candidate, bytes);
  await checkpoint("saving", { outputProof: proof });
  const artifact = await saveLocation(row, { ...candidate, output_proof: proof }, bytes, signal);
  await checkpoint("image_ready", { artifact });
}

// Bounded storage-only execution for the owner's Retry saving action. A separate
// fenced lease makes repeated clicks/worker overlap safe without launching a worker.
export async function runLocationStorageClaim(claim: LocationRow) {
  if (!parseWorkerClaim("location", claim)) throw new LocationError("LOCATION_CLAIM_INVALID", "claim_validation");
  const db = createDatabaseClient();
  const abort = new AbortController(); let lost = false; let row = claim;
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(150_000)]);
  let pending: Promise<unknown> = Promise.resolve();
  const checkpoint: LocationCheckpoint = (operation, payload = {}) => {
    const task = pending.then(async () => {
      if (lost) throw new LocationError("LOCATION_LEASE_LOST", operation);
      let result;
      try { result = await db.rpc("ugc_location_checkpoint", { p_location: row.id, p_token: claim.claim_token!, p_operation: operation, p_payload: payload }); }
      catch (error) { lost = true; abort.abort(); throw locationFailure(error, `checkpoint_${operation}`, "LOCATION_DATABASE_FAILED"); }
      const committed = compositeRecord(result.data);
      if (result.error || committed?.id !== row.id || committed?.job_id !== row.job_id) { lost = true; abort.abort(); throw locationFailure(result.error, operation, result.error ? "LOCATION_DATABASE_FAILED" : "LOCATION_LEASE_LOST"); }
      row = committed as unknown as LocationRow; return row;
    });
    pending = task.catch(() => {}); return task;
  };
  const heartbeat = setInterval(() => { void checkpoint("heartbeat").catch(() => {}); }, 20_000);
  try {
    if (row.state === "rejecting") await deleteLocationOutput(row, signal, checkpoint);
    else await recoverLocationOutput(row, signal, checkpoint);
  }
  catch (error) {
    const failure = locationFailure(error, claim.state === "rejecting" ? "deleting" : "recovering", claim.state === "rejecting" ? "LOCATION_DELETE_FAILED" : "LOCATION_RECOVERY_FAILED");
    let failureSaved = false;
    if (!lost) { try { await checkpoint("fail", { code: failure.code, diagnostic: failure.diagnostic }); failureSaved = true; } catch {} }
    console.error("UGC_LOCATION_TECHNICAL_FAILURE", JSON.stringify({ ...failure.diagnostic, projectId: claim.project_id, jobId: claim.job_id,
      locationId: claim.id, retryState: failureSaved ? "manual_retry_required" : "lease_recovery_fenced", failureSaved }));
    throw failure;
  } finally { clearInterval(heartbeat); abort.abort(); await pending; }
}
