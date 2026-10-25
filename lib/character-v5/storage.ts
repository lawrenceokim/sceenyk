import "server-only";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { headR2CharacterObject, putR2CharacterImage, readR2AnalysisMedia } from "@/lib/storage/r2";
import { CharacterV5Error, v5ArtifactSchema, v5OutputProofSchema, type V5Artifact, type V5Workflow, type V5OutputProof } from "./contract";
import { v5StorageDiagnostic } from "./storage-diagnostics";

export const v5Prefix = (workflow: Pick<V5Workflow, "owner_user_id" | "project_id" | "job_id" | "id">) =>
  `ugc/${workflow.owner_user_id}/${workflow.project_id}/${workflow.job_id}/character-v5/${workflow.id}/candidates/`;
export async function technicalPng(bytes: Buffer) {
  try {
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new Error();
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (!["png", "jpeg", "webp"].includes(meta.format ?? "") || (meta.pages ?? 1) !== 1 || !meta.width || !meta.height ||
      Math.min(meta.width, meta.height) < 128 || Math.max(meta.width, meta.height) > 4096) throw new Error();
    const output = await image.rotate().png().toBuffer();
    if (output.length > 20 * 1024 * 1024) throw new Error();
    return output;
  } catch { throw new CharacterV5Error("image_decode", "CHARACTER_IMAGE_DECODE_FAILED"); }
}
export async function v5OutputProof(id: string, bytes: Buffer): Promise<V5OutputProof> {
  const meta = await sharp(bytes).metadata();
  return v5OutputProofSchema.parse({ id, sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.length, width: meta.width, height: meta.height, mimeType: "image/png" });
}
export async function readV5Artifact(workflow: V5Workflow, value: V5Artifact, signal: AbortSignal) {
  const asset = v5ArtifactSchema.parse(value);
  if (!asset.storageKey.startsWith(v5Prefix(workflow))) throw new CharacterV5Error("input_read");
  try {
    const stream = await readR2AnalysisMedia(asset.storageKey, asset.etag, asset.sizeBytes,
      AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
    const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const item = await reader.read(); if (item.done) break;
      size += item.value.length; if (size > asset.sizeBytes) throw new Error(); chunks.push(item.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (size !== asset.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error();
    return bytes;
  } catch (error) { throw new CharacterV5Error("input_read", "CHARACTER_PRIVATE_IMAGE_READ_FAILED", undefined,
    v5StorageDiagnostic(error, { slot: workflow.slot, objectKeyPresent: !!asset.storageKey, providerOutputRecoverable: false })); }
}
export async function saveV5Artifact(workflow: V5Workflow, id: string, bytes: Buffer, signal: AbortSignal, providerOutputRecoverable = false) {
  const key = `${v5Prefix(workflow)}${id}.png`;
  const proof = await v5OutputProof(id, bytes);
  // Existing objects are never replaced. Verify before PUT and after uncertain
  // writes, including a lost successful response or a conditional-write race.
  const existing = await recoverV5Artifact(workflow, id, signal, proof);
  if (existing) return existing;
  try { await putR2CharacterImage(key, bytes, signal); }
  catch (error) {
    if (!signal.aborted) {
      try { const committed = await recoverV5Artifact(workflow, id, signal, proof); if (committed) return committed; }
      catch { /* Retain the original PUT diagnostic; do not guess commit status. */ }
    }
    throw new CharacterV5Error("r2_write", "CHARACTER_R2_WRITE_FAILED", undefined,
      v5StorageDiagnostic(error, { slot: workflow.slot, objectKeyPresent: !!key, providerOutputRecoverable }));
  }
  try {
    const object = await headR2CharacterObject(key, signal);
    if (!object || !object.etag || object.sizeBytes !== bytes.length || object.mimeType !== "image/png") throw new Error();
    const meta = await sharp(bytes).metadata();
    const asset = v5ArtifactSchema.parse({ id, storageKey: key, etag: object.etag, sizeBytes: bytes.length,
      width: meta.width, height: meta.height, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") });
    await readV5Artifact(workflow, asset, signal); // Conditional GET and hash confirm the exact immutable object.
    return asset;
  } catch (error) { throw new CharacterV5Error("r2_verify", "CHARACTER_R2_VERIFY_FAILED", undefined,
    error instanceof CharacterV5Error && error.storage ? { ...error.storage, providerOutputRecoverable } :
      v5StorageDiagnostic(error, { slot: workflow.slot, objectKeyPresent: !!key, providerOutputRecoverable })); }
}
// Recover a committed private PUT before downloading an expiring provider output
// again. This reads only the durable candidate's exact immutable planned key.
export async function recoverV5Artifact(workflow: V5Workflow, id: string, signal: AbortSignal, proof?: V5OutputProof | null) {
  const key = `${v5Prefix(workflow)}${id}.png`;
  try {
    const object = await headR2CharacterObject(key, signal); if (!object) return null;
    if (!object.etag || object.mimeType !== "image/png" || object.sizeBytes < 1 || object.sizeBytes > 20 * 1024 * 1024) throw new Error();
    const stream = await readR2AnalysisMedia(key, object.etag, object.sizeBytes, AbortSignal.any([signal, AbortSignal.timeout(30_000)]));
    const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > object.sizeBytes) throw new Error(); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = Buffer.concat(chunks); if (size !== object.sizeBytes) throw new Error();
    await technicalPng(bytes); const meta = await sharp(bytes).metadata();
    const asset = v5ArtifactSchema.parse({ id, storageKey: key, etag: object.etag, sizeBytes: size,
      width: meta.width, height: meta.height, mimeType: "image/png", sha256: createHash("sha256").update(bytes).digest("hex") });
    if (!proof) throw new CharacterV5Error("r2_verify", "CHARACTER_OUTPUT_PROOF_MISSING");
    const expected = v5OutputProofSchema.parse(proof);
    if (expected.id !== id || expected.sha256 !== asset.sha256 || expected.sizeBytes !== asset.sizeBytes ||
      expected.width !== asset.width || expected.height !== asset.height || expected.mimeType !== asset.mimeType) {
      throw new CharacterV5Error("r2_verify", "CHARACTER_OUTPUT_PROOF_MISMATCH");
    }
    return asset;
  } catch (error) { if (error instanceof CharacterV5Error) throw error;
    throw new CharacterV5Error("r2_verify", "CHARACTER_R2_VERIFY_FAILED", undefined,
      v5StorageDiagnostic(error, { slot: workflow.slot, objectKeyPresent: !!key, providerOutputRecoverable: false })); }
}
export async function cropV5Front(bytes: Buffer, cropTop: number) {
  try {
    if (!Number.isInteger(cropTop) || cropTop < 500 || cropTop > 6000) throw new Error();
    const image = sharp(bytes, { limitInputPixels: 20_000_000, failOn: "warning" }); const meta = await image.metadata();
    if (!meta.width || !meta.height) throw new Error();
    const top = Math.ceil(meta.height * cropTop / 10_000);
    return await technicalPng(await image.extract({ left: 0, top, width: meta.width, height: meta.height - top }).png().toBuffer());
  } catch { throw new CharacterV5Error("local_crop", "CHARACTER_FRONT_CROP_INVALID"); }
}
