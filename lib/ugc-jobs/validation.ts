import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import type { AssetRow } from "@/lib/db/types";
import { mediaKindForMime } from "@/lib/media/validation";
import { verifyStoredMedia } from "@/lib/storage/server";
import {
  ugcDefaultNarration, ugcGenerationSnapshotSchema, ugcInputIssue, ugcIssuesFromSchema, uniqueUgcIssues,
  type UgcInputIssue, type UgcInputValidation, type UgcGenerationSnapshot,
} from "./input-contract";

function reference(asset: AssetRow | undefined) {
  return asset ? { assetId: asset.id, referenceId: asset.reference_id, mimeType: asset.mime_type, sizeBytes: asset.size_bytes, etag: asset.verified_etag } : undefined;
}

// Trusted internal helper only. Interactive callers derive ownerId from Clerk;
// workers derive it from their persisted, claim-fenced job, never a browser ID.
// The frozen mode validates the exact request, not later draft text/settings.
export async function validateUgcGenerationInput(projectId: string, ownerId: string, options?: { snapshot: unknown }): Promise<UgcInputValidation> {
  if (!z.uuid().safeParse(projectId).success || !z.uuid().safeParse(ownerId).success) {
    return { ready: false, issues: [ugcInputIssue("PROJECT_UNAVAILABLE")] };
  }
  const db = createDatabaseClient();
  const project = await db.from("projects").select("*").eq("id", projectId).eq("owner_user_id", ownerId).eq("status", "draft").maybeSingle();
  if (project.error) return { ready: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  if (!project.data) return { ready: false, issues: [ugcInputIssue("PROJECT_UNAVAILABLE")] };

  let frozen: UgcGenerationSnapshot | undefined;
  if (options) {
    const parsed = ugcGenerationSnapshotSchema.safeParse(options.snapshot);
    if (!parsed.success || parsed.data.projectId !== projectId) return { ready: false, issues: [ugcInputIssue("INVALID_SNAPSHOT")] };
    // Snapshot strings must already have their canonical representation.
    const raw = options.snapshot as UgcGenerationSnapshot;
    if (raw.projectTitle !== parsed.data.projectTitle || raw.sceneDescription !== parsed.data.sceneDescription) {
      return { ready: false, issues: [ugcInputIssue("INVALID_SNAPSHOT")] };
    }
    frozen = parsed.data;
  }

  let query = db.from("project_assets").select("*").eq("project_id", projectId).eq("owner_user_id", ownerId);
  if (frozen) query = query.in("id", [frozen.character.assetId, frozen.product.assetId]);
  else query = query.eq("removed_from_draft", false).in("studio_role", ["character", "product"]);
  const result = await query;
  if (result.error || !result.data) return { ready: false, issues: [ugcInputIssue("READINESS_UNAVAILABLE")] };
  const assets = result.data;
  const characters = assets.filter(asset => asset.studio_role === "character");
  const products = assets.filter(asset => asset.studio_role === "product");
  const issues: UgcInputIssue[] = [];
  if (!characters.length) issues.push(ugcInputIssue(frozen ? "MEDIA_NOT_FOUND" : "UGC_CHARACTER_REQUIRED", "character"));
  if (characters.length > 1) issues.push(ugcInputIssue("UGC_CHARACTER_LIMIT"));
  if (!products.length) issues.push(ugcInputIssue(frozen ? "MEDIA_NOT_FOUND" : "UGC_PRODUCT_REQUIRED", "product"));
  if (products.length > 1) issues.push(ugcInputIssue("UGC_PRODUCT_LIMIT"));

  const p = project.data;
  const candidate = frozen ?? {
    schemaVersion: 2, readiness: "validated", projectId,
    projectTitle: p.title, creationType: p.creation_type, ugcType: p.ugc_type,
    sceneDescription: p.prompt,
    settings: { duration: p.duration, aspectRatio: p.aspect_ratio, visualStyle: p.visual_style, tone: p.tone },
    narration: ugcDefaultNarration, character: reference(characters[0]), product: reference(products[0]),
  };
  const parsed = ugcGenerationSnapshotSchema.safeParse(candidate);
  if (!parsed.success) issues.push(...ugcIssuesFromSchema(parsed.error).filter(issue =>
    !((issue.field === "character" && characters.length !== 1) || (issue.field === "product" && products.length !== 1))));

  for (const [role, asset] of [["character", characters[0]], ["product", products[0]]] as const) {
    if (!asset) continue;
    if (asset.owner_user_id !== ownerId || asset.project_id !== projectId) issues.push(ugcInputIssue("MEDIA_NOT_OWNED", role));
    else if (asset.removed_from_draft) issues.push(ugcInputIssue("MEDIA_NOT_FOUND", role));
    else if (asset.upload_status !== "uploaded" || !asset.verified_etag || !asset.reference_id) issues.push(ugcInputIssue("MEDIA_NOT_READY", role));
    else if (asset.storage_provider !== "r2" || asset.media_type !== "image" || mediaKindForMime(asset.mime_type) !== "image" || asset.size_bytes <= 0) issues.push(ugcInputIssue("INVALID_IMAGE", role));
    else if (frozen && JSON.stringify(reference(asset)) !== JSON.stringify(frozen[role])) issues.push(ugcInputIssue("INPUT_CHANGED", role));
  }
  if (issues.length || !parsed.success) return { ready: false, issues: uniqueUgcIssues(issues) };

  // Read-only bounded object/signature verification through the existing private
  // storage service. No URL/key/bytes escape this trusted server boundary.
  const storageIssues = await Promise.all(([characters[0], products[0]] as const).map(async (asset, index) => {
    const field = index === 0 ? "character" : "product";
    try {
      const stored = await verifyStoredMedia(asset.storage_key, asset.mime_type, asset.size_bytes);
      if (stored.status === "missing") return ugcInputIssue("MEDIA_NOT_FOUND", field);
      if (stored.status !== "verified" || stored.etag !== asset.verified_etag) return ugcInputIssue("INVALID_IMAGE", field);
      return null;
    } catch { return ugcInputIssue("MEDIA_UNAVAILABLE", field); }
  }));
  const failed = storageIssues.filter((issue): issue is UgcInputIssue => issue !== null);
  return failed.length ? { ready: false, issues: failed } : { ready: true, data: parsed.data };
}
