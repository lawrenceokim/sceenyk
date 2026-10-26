import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { deleteR2LocationCandidate, headR2CharacterObject } from "@/lib/storage/r2";
import type { LocationRow } from "./contract";
import type { LocationCheckpoint } from "./recovery";
import { locationKey } from "./media";
import { removeRejectedLocationBytes } from "./spool";
import { LocationError } from "./errors";

// Deletion is independent of all planning/generation providers and queue creation.
export async function deleteLocationOutput(row: LocationRow, signal: AbortSignal, checkpoint: LocationCheckpoint) {
  const result = await createDatabaseClient().from("ugc_location_candidates").select("*").eq("id", row.candidate_id!).eq("location_id", row.id).single();
  const candidate = result.data;
  if (result.error || !candidate || row.state !== "rejecting" || candidate.state !== "rejecting" || row.accepted_candidate_id === candidate.id) {
    throw new LocationError("LOCATION_DELETE_DENIED", "deleting");
  }
  const key = locationKey(row, candidate);
  if (candidate.artifact && candidate.artifact.storageKey !== key) throw new LocationError("LOCATION_DELETE_DENIED", "deleting");
  const object = await headR2CharacterObject(key, signal);
  if (object) await deleteR2LocationCandidate(key, candidate.artifact?.etag ?? object.etag, signal);
  await removeRejectedLocationBytes(row, candidate);
  await checkpoint("deleted");
}
