import "server-only";
import { mkdir, open, lstat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import type { LocationRow, LocationCandidate } from "./contract";
import { LocationError } from "./errors";

function spoolPath(row: LocationRow, candidate: Pick<LocationCandidate, "id" | "location_id">) {
  const segments = [row.owner_user_id, row.project_id, row.job_id, row.id, candidate.id];
  if (candidate.location_id !== row.id || segments.some(value => !/^[a-f0-9-]{36}$/.test(value))) throw new LocationError("LOCATION_RECOVERY_INVALID", "local_recovery");
  return join(process.env.UGC_LOCATION_RECOVERY_DIR?.trim() || join(tmpdir(), "sceenyk-location-recovery-v1"), segments.join("_") + ".png");
}
// Private, candidate-bound durable bytes precede any R2 upload. No DB blob/base64.
// Keep the same directory across app/worker restarts on this local machine.
export async function stageLocationBytes(row: LocationRow, candidate: LocationCandidate, bytes: Buffer) {
  if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new LocationError("LOCATION_IMAGE_INVALID", "local_recovery");
  const path = spoolPath(row, candidate);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let file;
  try { file = await open(path, "wx", 0o600); }
  catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") throw error;
    const existing = await readLocationBytes(row, candidate);
    if (!existing || !existing.equals(bytes)) throw new LocationError("LOCATION_RECOVERY_CHANGED", "local_recovery");
    return;
  }
  try { await file.writeFile(bytes); await file.sync(); } finally { await file.close(); }
}
export async function readLocationBytes(row: LocationRow, candidate: LocationCandidate): Promise<Buffer | null> {
  const path = spoolPath(row, candidate);
  let stat;
  try { stat = await lstat(path); } catch (error) { if ((error as { code?: string }).code === "ENOENT") return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || !stat.size || stat.size > 20 * 1024 * 1024) throw new LocationError("LOCATION_RECOVERY_INVALID", "local_recovery");
  const file = await open(path, "r");
  let bytes: Buffer;
  try {
    const bound = await file.stat(); if (bound.size !== stat.size || !bound.isFile()) throw new Error();
    const buffer = Buffer.alloc(stat.size + 1); let total = 0;
    while (total < buffer.length) {
      const part = await file.read(buffer, total, buffer.length - total, total);
      if (!part.bytesRead) break; total += part.bytesRead;
    }
    bytes = buffer.subarray(0, total);
  }
  finally { await file.close(); }
  if (bytes.length !== stat.size || candidate.output_proof && createHash("sha256").update(bytes).digest("hex") !== candidate.output_proof.sha256) {
    throw new LocationError("LOCATION_RECOVERY_CHANGED", "local_recovery");
  }
  return bytes;
}
export async function removeRejectedLocationBytes(row: LocationRow, candidate: LocationCandidate) {
  if (candidate.state !== "rejecting" || candidate.id === row.accepted_candidate_id) throw new LocationError("LOCATION_DELETE_DENIED", "deleting");
  try { await unlink(spoolPath(row, candidate)); } catch (error) { if ((error as { code?: string }).code !== "ENOENT") throw error; }
}
