import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createDatabaseClient } from "@/lib/db/server";
import { resolveApprovedProjectVideo } from "@/lib/projects/approved-video";
import { browseMarketplace } from "./server";
import { publishedVideoBindings } from "./video-preview-server";
import { galleryInputSchema, type MarketplaceCard, type MarketplaceGalleryReply } from "./gallery-contract";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readMarketplaceGallery(input: unknown): Promise<MarketplaceGalleryReply> {
  const { query, category, page, pages, known } = galleryInputSchema.parse(input);
  const results = await Promise.all(Array.from({ length: pages }, (_, offset) => browseMarketplace({ query, category, page: page + offset })));
  const listings = [...new Map(results.flatMap(result => result.items).map(item => [item.id, item])).values()];
  const bindings = await publishedVideoBindings(listings.map(item => item.id));
  const projects = [...new Set(bindings.map(binding => binding.source_project_id))];
  const db = createDatabaseClient() as unknown as SupabaseClient;
  // Compact saved revisions detect approval/rejection/replacement without
  // fetching full private workspaces for unchanged cards. Nothing here is public.
  const stamps = projects.length ? await Promise.all([
    db.from("projects").select("id,updated_at,deleted_at").in("id", projects).order("id"),
    db.from("ugc_v3_sources").select("project_id,revision,input_hash").in("project_id", projects).order("project_id").order("revision"),
    db.from("ugc_v3_runs").select("id,project_id,state,completed_at,sha256:result->>sha256").in("project_id", projects).order("id"),
    db.from("ugc_v3_artifacts").select("id,project_id,kind,version,approved_at,rejected_at").in("project_id", projects).order("id"),
    db.from("ugc_v3_tasks").select("id,project_id,kind,status,created_at").in("project_id", projects).order("id"),
    db.from("project_assets").select("id,project_id,updated_at").in("project_id", projects).order("id"),
    db.from("ugc_final_executions").select("id,project_id,state,approved_at,updated_at").in("project_id", projects).order("id"),
  ].map(async query => {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await query.range(offset, offset + 499);
      if (result.error) throw new Error("MARKETPLACE_GALLERY_UNAVAILABLE");
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  })) : [];
  const changed: Record<string, MarketplaceCard> = {};
  const available = listings.filter(listing => bindings.some(binding => binding.id === listing.id));
  await Promise.all(available.map(async listing => {
    const binding = bindings.find(value => value.id === listing.id)!;
    const revision = digest([listing, binding, stamps.map(rows => rows.filter(row => (row.project_id ?? row.id) === binding.source_project_id))]);
    if (known[listing.id] === revision) return;
    try {
      const projectRows = (index: number) => stamps[index]?.filter(row => row.project_id === binding.source_project_id) ?? [];
      const hasApprovedFinal = projectRows(2).some(row => row.state === "approved" && row.completed_at) ||
        projectRows(3).some(row => row.kind === "joined" && row.approved_at && !row.rejected_at) ||
        projectRows(6).some(row => row.state === "approved" && row.approved_at);
      const video = hasApprovedFinal ? await resolveApprovedProjectVideo(binding.creator_user_id, binding.source_project_id) : null;
      changed[listing.id] = { ...listing, revision, videoVersion: video?.version ?? null, posterVersion: binding.preview_etag ? digest(binding.preview_etag) : null };
    } catch {
      // Keep published static cards during a preview failure. This distinct
      // receipt ensures the next background check retries approval safely.
      changed[listing.id] = { ...listing, revision: digest([revision, "preview-unavailable"]), videoVersion: null, posterVersion: binding.preview_etag ? digest(binding.preview_etag) : null };
    }
  }));
  return { ids: available.map(item => item.id), changed, total: results[0].total, page, pages };
}
