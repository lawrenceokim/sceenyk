import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDatabaseClient } from "@/lib/db/server";
import { getAcquiredTemplates } from "@/lib/marketplace/purchases/server";
import { publishedVideoBindings } from "@/lib/marketplace/video-preview-server";
import { resolveApprovedProjectVideo } from "@/lib/projects/approved-video";
import { purchaseGalleryInput, type PurchaseGalleryCard, type PurchaseGalleryReply } from "./gallery-contract";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readPurchasesGallery(input: unknown): Promise<PurchaseGalleryReply> {
  const { page, known } = purchaseGalleryInput.parse(input);
  // This existing read verifies the session and mapped app user, never syncing
  // an existing Clerk profile. The acquisition RPC owns paid/free access rules.
  const data = await getAcquiredTemplates(page);
  if (data.page !== page || data.items.length > 12) throw new Error("PURCHASES_INVALID_PAGE");
  const listingIds = [...new Set(data.items.map(item => item.listingId))];
  const db = createDatabaseClient() as unknown as SupabaseClient;
  // Historical thumbnail metadata is allowed only for IDs from the owned index.
  // Its actual bytes still pass the existing acquisition-preview permission RPC.
  const metadata = listingIds.length ? await db.from("marketplace_listings").select("id,updated_at,preview_etag").in("id", listingIds).order("id") : { data: [], error: null };
  if (metadata.error) throw new Error("PURCHASES_UNAVAILABLE");
  const listings = z.array(z.object({ id: z.uuid(), updated_at: z.string(), preview_etag: z.string().nullable() })).parse(metadata.data);
  const bindings = await publishedVideoBindings(listingIds);
  const projects = [...new Set(bindings.map(binding => binding.source_project_id))];
  // Only currently published, rights-confirmed listing lineage may be used to
  // inspect a creator's final-video evidence. No browser source/owner is accepted.
  const stamps = projects.length ? await Promise.all([
    db.from("projects").select("id,updated_at,deleted_at").in("id", projects).order("id"),
    db.from("project_assets").select("id,project_id,updated_at").in("project_id", projects).order("id"),
    db.from("ugc_v3_sources").select("project_id,revision,input_hash").in("project_id", projects).order("project_id").order("revision"),
    db.from("ugc_v3_runs").select("id,project_id,state,completed_at,sha256:result->>sha256").in("project_id", projects).order("id"),
    db.from("ugc_v3_artifacts").select("id,project_id,kind,version,approved_at,rejected_at").in("project_id", projects).order("id"),
    db.from("ugc_v3_tasks").select("id,project_id,kind,status,created_at").in("project_id", projects).order("id"),
    db.from("ugc_final_executions").select("id,project_id,state,approved_at,updated_at").in("project_id", projects).order("id"),
  ].map(async query => {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await query.range(offset, offset + 499);
      if (result.error || !result.data) throw new Error("PURCHASES_UNAVAILABLE");
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  })) : [];
  const changed: Record<string, PurchaseGalleryCard> = {};
  await Promise.all(data.items.map(async purchase => {
    const listing = listings.find(listing => listing.id === purchase.listingId);
    if (!listing) throw new Error("PURCHASES_UNAVAILABLE");
    const binding = bindings.find(binding => binding.id === purchase.listingId);
    const rows = binding ? stamps.map(rows => rows.filter(row => (row.project_id ?? row.id) === binding.source_project_id)) : [];
    const revision = digest([purchase, listing, binding ?? null, rows]), posterVersion = digest([purchase.previewUrl, listing.preview_etag]);
    if (known[purchase.id] === revision) return;
    try {
      const candidate = binding && (rows[3].some(row => row.state === "approved" && row.completed_at) ||
        rows[4].some(row => row.kind === "joined" && row.approved_at && !row.rejected_at) || rows[6].some(row => row.state === "approved" && row.approved_at));
      const video = candidate ? await resolveApprovedProjectVideo(binding.creator_user_id, binding.source_project_id) : null;
      changed[purchase.id] = { ...purchase, revision, videoVersion: video?.version ?? null, posterVersion };
    } catch {
      changed[purchase.id] = { ...purchase, revision: digest([revision, "preview-unavailable"]), videoVersion: null, posterVersion };
    }
  }));
  return { clerkUserId: data.clerkUserId, page, pageSize: 12, total: data.total, ids: data.items.map(item => item.id), changed };
}
