import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readAppUser } from "@/lib/auth/read-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { ownedListingSchema } from "@/lib/marketplace/contract";
import { withEstimate } from "@/lib/marketplace/server";
import { resolveApprovedProjectVideo } from "@/lib/projects/approved-video";
import { templateGalleryInput, type TemplateGalleryReply, type TemplateGalleryCard } from "./gallery-contract";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function readTemplatesGallery(input: unknown): Promise<TemplateGalleryReply> {
  const { page, known } = templateGalleryInput.parse(input), user = await readAppUser();
  const database = createDatabaseClient();
  const result = await database.rpc("marketplace_owned", { p_owner_user_id: user.id, p_page: page });
  if (result.error) throw new Error("TEMPLATES_UNAVAILABLE");
  const data = z.object({ items: z.array(ownedListingSchema).max(12), total: z.number().int().nonnegative(), page: z.literal(page), pageSize: z.literal(12) }).parse(result.data);
  const db = database as unknown as SupabaseClient;
  const ids = data.items.map(item => item.id), projects = [...new Set(data.items.map(item => item.sourceProjectId))];
  const bindingResult = ids.length ? await db.from("marketplace_listings").select("id,source_project_id,updated_at,preview_etag")
    .eq("creator_user_id", user.id).in("id", ids).is("deleted_at", null) : { data: [], error: null };
  if (bindingResult.error) throw new Error("TEMPLATES_UNAVAILABLE");
  const bindings = z.array(z.object({ id: z.uuid(), source_project_id: z.uuid(), updated_at: z.string(), preview_etag: z.string().nullable() })).parse(bindingResult.data);
  // IDs originate only in the authenticated owner-only listing RPC. V3 tables
  // have no owner column; never filter privileged reads by browser project IDs.
  const stamps = projects.length ? await Promise.all([
    db.from("projects").select("id,updated_at,deleted_at").eq("owner_user_id", user.id).in("id", projects).order("id"),
    db.from("project_assets").select("id,project_id,updated_at").eq("owner_user_id", user.id).in("project_id", projects).order("id"),
    db.from("ugc_v3_sources").select("project_id,revision,input_hash").in("project_id", projects).order("project_id").order("revision"),
    db.from("ugc_v3_runs").select("id,project_id,state,completed_at,sha256:result->>sha256").in("project_id", projects).order("id"),
    db.from("ugc_v3_artifacts").select("id,project_id,kind,version,approved_at,rejected_at").in("project_id", projects).order("id"),
    db.from("ugc_v3_tasks").select("id,project_id,kind,status,created_at").in("project_id", projects).order("id"),
    db.from("ugc_final_executions").select("id,project_id,state,approved_at,updated_at").eq("owner_user_id", user.id).in("project_id", projects).order("id"),
  ].map(async query => {
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await query.range(offset, offset + 499);
      if (result.error || !result.data) throw new Error("TEMPLATES_UNAVAILABLE");
      rows.push(...result.data);
      if (result.data.length < 500) return rows;
    }
  })) : [];
  const changed: Record<string, TemplateGalleryCard> = {};
  const available = data.items.filter(item => bindings.some(binding => binding.id === item.id && binding.source_project_id === item.sourceProjectId));
  await Promise.all(available.map(async item => {
    const listing = withEstimate(item), binding = bindings.find(binding => binding.id === item.id)!;
    const rows = stamps.map(rows => rows.filter(row => (row.project_id ?? row.id) === item.sourceProjectId));
    const revision = digest([listing, binding, rows]);
    if (known[item.id] === revision) return;
    const posterVersion = digest(binding.preview_etag ?? rows[1]);
    try {
      const candidate = rows[3].some(row => row.state === "approved" && row.completed_at) ||
        rows[4].some(row => row.kind === "joined" && row.approved_at && !row.rejected_at) || rows[6].some(row => row.state === "approved" && row.approved_at);
      const video = item.status !== "draft" && candidate ? await resolveApprovedProjectVideo(user.id, item.sourceProjectId) : null;
      let posterKind: "image" | "video" | null = listing.previewUrl ? "image" : null;
      if (!listing.previewUrl) {
        const source = await database.rpc("marketplace_template_source", { p_listing_id: item.id, p_owner_user_id: user.id });
        if (source.error) throw new Error("TEMPLATE_SOURCE_UNAVAILABLE");
        if (source.data) {
          const parsed = z.object({ projectId: z.literal(item.sourceProjectId), assetId: z.uuid(), kind: z.enum(["image", "video"]) }).parse(source.data);
          posterKind = parsed.kind;
        }
      }
      changed[item.id] = { ...listing, revision, videoVersion: video?.version ?? null, posterVersion, posterKind };
    } catch {
      // Fail closed for motion while retaining the existing owned static cover.
      // A distinct revision ensures the next check retries failed enrichment.
      changed[item.id] = { ...listing, revision: digest([revision, "preview-unavailable"]), videoVersion: null, posterVersion, posterKind: listing.previewUrl ? "image" : null };
    }
  }));
  return { clerkUserId: user.clerk_user_id, page, pageSize: 12, total: data.total, ids: available.map(item => item.id), changed };
}
