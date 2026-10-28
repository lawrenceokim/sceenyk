import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { headR2CharacterObject, readR2AnalysisMedia, putR2UgcFinalObject } from "@/lib/storage/r2";
import { FinalVideoError, assetSchema, type FinalAsset, type FinalExecution, type Operation, type ResponseProof } from "./contract";

export const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export const finalPrefix = (run: FinalExecution) => `ugc/${run.owner_user_id}/${run.project_id}/${run.job_id}/final-video-v1/${run.id}/`;
export function recoveryRoot() { return path.resolve(process.env.UGC_FINAL_RECOVERY_DIR || path.join(process.cwd(), ".ugc-final-recovery")); }
export async function recoveryFile(run: FinalExecution, id: string, extension: string) {
  if (!/^[a-f0-9-]{36}$/.test(run.id) || !/^[a-f0-9-]{36}$/.test(id) || !/^(?:source\.bytes|[a-z]+(?:\.(?:mp3|mp4|wav|txt|json))?)$/.test(extension)) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
  const directory = path.join(recoveryRoot(), run.id); await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await fs.lstat(directory); if (!info.isDirectory() || info.isSymbolicLink()) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
  if (!["bytes", "source.bytes", "receipt.json", "response.json"].includes(extension) && run.claim_token) {
    if (!/^[a-f0-9-]{36}$/.test(run.claim_token)) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
    const scratch = path.join(directory, `scratch-${run.claim_token}`);
    await fs.mkdir(scratch, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(scratch)).isSymbolicLink()) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
    return path.join(scratch, `${id}.${extension}`);
  }
  return path.join(directory, `${id}.${extension}`);
}
export async function cleanScratch(run: FinalExecution) {
  if (!/^[a-f0-9-]{36}$/.test(run.id) || !/^[a-f0-9-]{36}$/.test(run.claim_token ?? "")) return;
  const base = path.join(recoveryRoot(), run.id), target = path.join(base, `scratch-${run.claim_token}`);
  if (path.dirname(target) !== base) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
  await fs.rm(target, { recursive: true, force: true });
}
export async function spool(run: FinalExecution, id: string, extension: string, bytes: Buffer) {
  const file = await recoveryFile(run, id, extension); const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temporary, file); return file;
}
export async function readSpool(run: FinalExecution, id: string, extension: string) {
  try { const file = await recoveryFile(run, id, extension); const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 256 * 1024 * 1024) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
    return await fs.readFile(file);
  } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
}
export async function deleteFinalSpool(run: FinalExecution, operationId: string) {
  const file = await recoveryFile(run, operationId, "bytes");
  try { await fs.unlink(file); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
}
export async function saveResponse(run: FinalExecution, id: string, bytes: Buffer, signal: AbortSignal): Promise<ResponseProof> {
  await spool(run, id, "response.json", bytes);
  const key = `${finalPrefix(run)}${id}.json`;
  let object = await headR2CharacterObject(key, signal);
  if (!object) { try { await putR2UgcFinalObject(key, bytes, "application/json", signal); } catch {} object = await headR2CharacterObject(key, signal); }
  if (!object || object.sizeBytes !== bytes.length || object.mimeType !== "application/json") throw new FinalVideoError("FINAL_STORAGE_FAILED");
  const proof = { key, etag: object.etag, sizeBytes: bytes.length, sha256: sha256(bytes) };
  const saved = await readResponse(run, id, signal, proof);
  if (!saved || sha256(saved) !== proof.sha256) throw new FinalVideoError("FINAL_ASSET_CHANGED"); return proof;
}
export async function readResponse(run: FinalExecution, id: string, signal: AbortSignal, expected?: ResponseProof) {
  const key = `${finalPrefix(run)}${id}.json`;
  if (expected && expected.key !== key) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
  const object = await headR2CharacterObject(key, signal); if (!object) return null;
  if (object.mimeType !== "application/json" || object.sizeBytes > 48 * 1024 * 1024 || expected && (object.etag !== expected.etag || object.sizeBytes !== expected.sizeBytes)) throw new FinalVideoError("FINAL_ASSET_CHANGED");
  const stream = await readR2AnalysisMedia(key, object.etag, object.sizeBytes, signal); const reader = stream.getReader();
  const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > object.sizeBytes) throw new FinalVideoError("FINAL_ASSET_CHANGED"); parts.push(part.value); } }
  finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(parts, size);
  if (size !== object.sizeBytes || expected && sha256(bytes) !== expected.sha256) throw new FinalVideoError("FINAL_ASSET_CHANGED");
  await spool(run, id, "response.json", bytes); return bytes;
}
export async function readPrivateAsset(run: FinalExecution, value: FinalAsset, signal: AbortSignal) {
  const asset = assetSchema.parse(value);
  if (!asset.key.startsWith(finalPrefix(run))) throw new FinalVideoError("FINAL_STORAGE_SCOPE");
  const stream = await readR2AnalysisMedia(asset.key, asset.etag, asset.sizeBytes, signal);
  const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length;
    if (size > asset.sizeBytes) throw new FinalVideoError("FINAL_ASSET_CHANGED"); chunks.push(part.value); }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = Buffer.concat(chunks, size);
  if (size !== asset.sizeBytes || sha256(bytes) !== asset.sha256) throw new FinalVideoError("FINAL_ASSET_CHANGED"); return bytes;
}
export async function savePrivateAsset(run: FinalExecution, operation: Pick<Operation, "id">, bytes: Buffer,
  metadata: Omit<FinalAsset, "key" | "sha256" | "etag" | "sizeBytes">, signal: AbortSignal): Promise<FinalAsset> {
  const extension = metadata.mimeType === "video/mp4" ? "mp4" : metadata.mimeType === "audio/mpeg" ? "mp3" : "wav";
  await spool(run, operation.id, "bytes", bytes);
  const key = `${finalPrefix(run)}${operation.id}.${extension}`;
  let object = await headR2CharacterObject(key, signal);
  if (!object) {
    try { await putR2UgcFinalObject(key, bytes, metadata.mimeType, signal); }
    catch { /* An upload acknowledgement may be lost. Inspect the same key. */ }
    object = await headR2CharacterObject(key, signal);
  }
  if (!object || object.sizeBytes !== bytes.length || object.mimeType !== metadata.mimeType) throw new FinalVideoError("FINAL_STORAGE_FAILED");
  const asset = assetSchema.parse({ ...metadata, key, etag: object.etag, sizeBytes: bytes.length, sha256: sha256(bytes) });
  await readPrivateAsset(run, asset, signal); return asset;
}
