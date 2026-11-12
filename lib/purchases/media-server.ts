import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getAcquiredTemplate, getAcquiredTemplatePreview } from "@/lib/marketplace/purchases/server";
import { readMarketplaceVideoPreview } from "@/lib/marketplace/video-preview-server";
import { readR2AnalysisMedia } from "@/lib/storage/r2";
import { projectMediaLifetimeMs, type ProjectMediaReply } from "@/lib/projects/cached-media-contract";

// The shared player's listingId field carries this card's acquisition ID.
// Never accept creator project/owner IDs or treat a listing ID as entitlement.
export const purchaseMediaInput = z.strictObject({ listingId: z.uuid(), kind: z.enum(["video", "poster"]), version: z.string().regex(/^[a-f0-9]{64}$/).optional() });
export async function readPurchaseMedia(input: unknown): Promise<ProjectMediaReply> {
  const { listingId: acquisitionId, kind, version } = purchaseMediaInput.parse(input);
  const acquired = await getAcquiredTemplate(acquisitionId);
  if (!acquired) return { state: "unavailable" };
  let media: ProjectMediaReply;
  if (kind === "video") {
    // Reuses the published-only boundary, current approval resolver, immutable
    // saved derivative and deduplicated FFmpeg queue. Never read private originals.
    media = await readMarketplaceVideoPreview(acquired.purchase.listingId, version);
  } else {
    const preview = await getAcquiredTemplatePreview(acquisitionId);
    if (!preview || preview.listingId !== acquired.purchase.listingId) return { state: "unavailable" };
    const current = createHash("sha256").update(JSON.stringify([preview.key, preview.etag])).digest("hex");
    const reply = { state: "ready" as const, version: current, expiresAt: new Date(Date.now() + projectMediaLifetimeMs).toISOString() };
    if (version === current) media = reply;
    else {
      const stream = await readR2AnalysisMedia(preview.key, preview.etag, preview.size, AbortSignal.timeout(15_000));
      media = { ...reply, mimeType: "image/webp", bytes: new Uint8Array(await new Response(stream).arrayBuffer()) };
    }
  }
  // Recheck the buyer after a bounded storage read; an identity/access change
  // cannot turn an earlier authorization into a response for another account.
  const current = await getAcquiredTemplate(acquisitionId);
  if (!current || current.clerkUserId !== acquired.clerkUserId || current.purchase.listingId !== acquired.purchase.listingId) return { state: "unavailable" };
  return media;
}
