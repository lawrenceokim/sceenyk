import "server-only";
import sharp from "sharp";
import { createDatabaseClient } from "@/lib/db/server";
import { readR2AnalysisMedia } from "@/lib/storage/r2";
import type { UgcGenerationSnapshot } from "@/lib/ugc-jobs/input-contract";
import type { UgcJobRow } from "@/lib/ugc-jobs/contract";
import type { ReferenceRole } from "./contract";

const maxSourceBytes = 100 * 1024 * 1024;
const maxProviderBytes = 20 * 1024 * 1024;
export class ReferenceMediaError extends Error {
  constructor(readonly code: "REFERENCE_ASSET_UNAVAILABLE" | "REFERENCE_IMAGE_UNSUPPORTED") { super(code); }
}

export async function loadReferenceImage(job: UgcJobRow, snapshot: UgcGenerationSnapshot, role: ReferenceRole, signal: AbortSignal): Promise<Buffer> {
  const source = snapshot[role];
  if (source.sizeBytes > maxSourceBytes) throw new ReferenceMediaError("REFERENCE_IMAGE_UNSUPPORTED");
  const { data: asset, error } = await createDatabaseClient().from("project_assets").select("*")
    .eq("id", source.assetId).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id)
    .eq("studio_role", role).eq("removed_from_draft", false).eq("upload_status", "uploaded").maybeSingle();
  if (error || !asset || asset.storage_provider !== "r2" || asset.media_type !== "image" ||
    asset.reference_id !== source.referenceId || asset.verified_etag !== source.etag || asset.size_bytes !== source.sizeBytes || asset.mime_type !== source.mimeType) {
    throw new ReferenceMediaError("REFERENCE_ASSET_UNAVAILABLE");
  }
  let bytes: Buffer;
  try {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(30_000)]);
    const stream = await readR2AnalysisMedia(asset.storage_key, source.etag, source.sizeBytes, boundedSignal);
    const reader = stream.getReader();
    const chunks: Buffer[] = [];
    let size = 0;
    try {
      while (true) {
        boundedSignal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > source.sizeBytes || size > maxSourceBytes) throw new Error("REFERENCE_SIZE_INVALID");
        chunks.push(Buffer.from(chunk.value));
      }
      if (size !== source.sizeBytes) throw new Error("REFERENCE_SIZE_INVALID");
      bytes = Buffer.concat(chunks, size);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  } catch { throw new ReferenceMediaError("REFERENCE_ASSET_UNAVAILABLE"); }
  try {
    // Decode only the first still frame, rotate from EXIF, strip metadata. This is
    // an ephemeral analysis input, never a generated sheet or a stored derivative.
    const decoder = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning" });
    const metadata = await decoder.metadata();
    if ((metadata.pages ?? 1) > 1) throw new Error("ANIMATED_REFERENCE_UNSUPPORTED");
    const png = await decoder.rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer();
    signal.throwIfAborted();
    if (png.length > maxProviderBytes) throw new Error("REFERENCE_SIZE_INVALID");
    return png;
  } catch { throw new ReferenceMediaError("REFERENCE_IMAGE_UNSUPPORTED"); }
}
