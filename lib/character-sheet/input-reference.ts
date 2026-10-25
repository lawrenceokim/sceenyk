import "server-only";
import { createHash } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { loadReferenceImage } from "@/lib/reference-analysis/media";
import type { UgcJobRow } from "@/lib/ugc-jobs/contract";
import type { UgcGenerationSnapshot } from "@/lib/ugc-jobs/input-contract";
import { inspectR2Object, readR2AnalysisMedia, signR2CharacterSource } from "@/lib/storage/r2";
import { characterInputReferenceSchema, type CharacterInputReference } from "./generation-contract";
import type { CharacterOperation } from "./contract";
import { normalizeCharacterImage } from "./media";
import { validateCharacterContent } from "./content-validation";
import { CharacterSheetError } from "./provider";
import { frontSourceContentReasons, hasCharacterValidation, type CharacterValidation } from "./validation-contract";

export async function originalCharacterReference(job: UgcJobRow, snapshot: UgcGenerationSnapshot, signal: AbortSignal) {
  const bytes = await normalizeCharacterImage(await loadReferenceImage(job, snapshot, "character", signal));
  const result = await createDatabaseClient().from("project_assets").select("storage_key")
    .eq("id", snapshot.character.assetId).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id)
    .eq("verified_etag", snapshot.character.etag).single();
  if (result.error || !result.data) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED");
  const reference = characterInputReferenceSchema.parse({ kind: "original", assetId: snapshot.character.assetId,
    storageKey: result.data.storage_key, etag: snapshot.character.etag, sha256: createHash("sha256").update(bytes).digest("hex") });
  return { reference, bytes };
}

export async function loadCharacterReference(job: Pick<UgcJobRow, "id" | "owner_user_id" | "project_id">, reference: CharacterInputReference,
  sourceProof: CharacterValidation | undefined, signal: AbortSignal) {
  if (reference.kind !== "original") {
    const prefix = `ugc/${job.owner_user_id}/${job.project_id}/${job.id}/`;
    const valid = reference.kind === "front_source" ? sourceProof?.state === "passed" && sourceProof.stage === "front_source" &&
      sourceProof.sha256 === reference.sha256 && !!sourceProof.observations && !frontSourceContentReasons(sourceProof.observations, sourceProof.cropTop ?? 0, sourceProof.cropSafe ?? false).length :
      hasCharacterValidation({ sha256: reference.sha256, characterValidation: sourceProof }, reference.kind === "back_reference" ? "back" : "face");
    if (!reference.storageKey.startsWith(prefix) || !valid) throw new CharacterSheetError("RECONCILIATION_REQUIRED");
    const object = await inspectR2Object(reference.storageKey);
    if (!object || object.etag !== reference.etag || !object.sizeBytes || object.sizeBytes > 20 * 1024 * 1024) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED");
    const stream = await readR2AnalysisMedia(reference.storageKey, reference.etag, object.sizeBytes, signal);
    const reader = stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { signal.throwIfAborted(); const part = await reader.read(); if (part.done) break;
      size += part.value.length; if (size > object.sizeBytes) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED"); chunks.push(part.value); }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
    const bytes = Buffer.concat(chunks);
    if (size !== object.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== reference.sha256) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED");
    return bytes;
  }
  throw new CharacterSheetError("CHARACTER_STORAGE_FAILED");
}
export async function characterInputUrl(job: Pick<UgcJobRow, "id" | "owner_user_id" | "project_id">, reference: CharacterInputReference,
  sourceProof: CharacterValidation | undefined, signal: AbortSignal) {
  if (reference.kind !== "original") await loadCharacterReference(job, reference, sourceProof, signal);
  else {
    const result = await createDatabaseClient().from("project_assets").select("id").eq("id", reference.assetId)
      .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).eq("storage_key", reference.storageKey)
      .eq("verified_etag", reference.etag).eq("upload_status", "uploaded").single();
    if (result.error || !result.data) throw new CharacterSheetError("CHARACTER_STORAGE_FAILED");
  }
  return signR2CharacterSource(reference.storageKey, reference.etag);
}

export async function originalFace(input: { bytes: Buffer; reference: CharacterInputReference; operation: CharacterOperation;
  model: string; historyPrefix: string; signal: AbortSignal; checkpoint: () => Promise<void> }) {
  const probe: CharacterOperation = { key: input.operation.key, state: "completed", startedAt: input.operation.startedAt, polls: 0,
    validation: input.operation.originalFaceValidation };
  try {
    const validation = await validateCharacterContent({ ...input, view: "face", stage: "original_face", contractVersion: 4, operation: probe,
      checkpoint: async () => { input.operation.originalFaceValidation = probe.validation; await input.checkpoint(); } });
    input.operation.validation = validation; input.operation.originalReference = input.reference;
    input.operation.faceOrigin = "original";
    input.operation.state = "completed"; await input.checkpoint();
    return validation;
  } catch (error) {
    if (error instanceof CharacterSheetError && error.diagnostic?.reason === "CHARACTER_SLOT_CONTENT_REJECTED") return null;
    throw error; // Uncertain visual checks never authorize an image-generation fallback.
  }
}
