import "server-only";
import { createHash } from "node:crypto";
import { createDatabaseClient } from "@/lib/db/server";
import { characterSheetDocumentSchema } from "@/lib/character-sheet/contract";
import type { UgcJobRow } from "@/lib/ugc-jobs/contract";
import { ugcGenerationSnapshotSchema } from "@/lib/ugc-jobs/input-contract";
import { v5ArtifactSchema } from "./contract";
import { productSheetDocumentSchema } from "@/lib/product-sheet/contract";

// Product's image generation is untouched. Resolve only its Character provenance
// prerequisite, preserving the historical parser when this job has no V5 workflow.
export async function productCharacterDependency(job: UgcJobRow) {
  const db = createDatabaseClient();
  const v5 = await db.from("ugc_character_v5_workflows").select("*").eq("job_id", job.id)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
  if (v5.error && !["PGRST205", "42P01"].includes(v5.error.code)) return null;
  if (v5.data) {
    if (v5.data.state !== "approved" || !v5.data.approved_at || !v5ArtifactSchema.safeParse(v5.data.sheet).success ||
      !["front", "back", "face", "front_source"].every(slot => v5ArtifactSchema.safeParse(v5.data!.accepted[slot as "front"]).success)) return null;
    const snapshot = ugcGenerationSnapshotSchema.parse(job.input_snapshot);
    if (snapshot.schemaVersion !== 3) return null;
    const fingerprint = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
    let id = v5.data.id;
    // Existing Product outputs keep the Character provenance under which they
    // were generated. V5 approval is still the current execution prerequisite.
    const product = await db.from("ugc_product_sheets").select("document").eq("job_id", job.id)
      .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
    if (product.error) return null;
    if (product.data) {
      const parsedProduct = productSheetDocumentSchema.safeParse(product.data.document); if (!parsedProduct.success) return null;
      if (parsedProduct.data.characterSheetId !== id) {
        const prior = await db.from("ugc_character_sheets").select("id,document,status").eq("id", parsedProduct.data.characterSheetId)
          .eq("job_id", job.id).eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
        const parsedPrior = characterSheetDocumentSchema.safeParse(prior.data?.document);
        if (prior.error || prior.data?.status !== "completed" || !parsedPrior.success || !parsedPrior.data.assets.sheet || parsedPrior.data.snapshotSha256 !== fingerprint) return null;
        id = prior.data.id;
      }
    }
    return { id, sourceAssetId: snapshot.character.assetId, name: snapshot.character.name, snapshotSha256: fingerprint };
  }
  const result = await db.from("ugc_character_sheets").select("*").eq("job_id", job.id)
    .eq("owner_user_id", job.owner_user_id).eq("project_id", job.project_id).maybeSingle();
  const parsed = characterSheetDocumentSchema.safeParse(result.data?.document);
  if (result.error || result.data?.status !== "completed" || !parsed.success || !parsed.data.assets.sheet) return null;
  return { id: result.data.id, sourceAssetId: result.data.source_asset_id, name: result.data.character_name,
    snapshotSha256: parsed.data.snapshotSha256 };
}
