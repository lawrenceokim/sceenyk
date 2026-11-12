import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { unstable_rethrow } from "next/navigation";
import { createDatabaseClient } from "@/lib/db/server";
import { ServiceOperationError } from "@/lib/diagnostics/service-failure";
import { getProjectCardStatuses } from "./card-status-server";
import { readOwnedProjectsIndex } from "./server";
import type { GalleryCard, GalleryReply } from "./gallery-contract";

const inputSchema = z.object({ page: z.number().int().min(1).max(100_000), known: z.record(z.uuid(), z.string().max(100)).refine(v => Object.keys(v).length <= 8) });
const stampRow = z.object({ project_id: z.uuid() }).passthrough();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export async function readOwnedProjectsGallery(input: unknown): Promise<GalleryReply> {
  const { page, known } = inputSchema.parse(input);
  const { user, data } = await readOwnedProjectsIndex(page);
  const ids = data.projects.map(p => p.id), db = createDatabaseClient();
  if (!ids.length) return { ok: true, clerkUserId: user.clerk_user_id, data, changed: {} };
  // V3 rows have no owner column. IDs come exclusively from the owned index
  // above; no browser-supplied project ID is used in these privileged reads.
  const v3 = db as unknown as SupabaseClient;
  const queries = [
    db.from("project_assets").select("id,project_id,updated_at").eq("owner_user_id", user.id).in("project_id", ids).order("id"),
    db.from("generation_jobs").select("id,project_id,status,updated_at").eq("owner_user_id", user.id).in("project_id", ids).order("id"),
    db.from("ugc_final_executions").select("id,project_id,state,approved_at,updated_at").eq("owner_user_id", user.id).in("project_id", ids).order("id"),
    v3.from("ugc_v3_runs").select("id,project_id,state,completed_at,sha256:result->>sha256").in("project_id", ids).order("id"),
    v3.from("ugc_v3_artifacts").select("id,project_id,kind,version,approved_at,rejected_at").in("project_id", ids).order("id"),
    v3.from("ugc_v3_tasks").select("id,project_id,status").in("project_id", ids).order("id"),
  ];
  const initialRead = !Object.keys(known).length;
  const stamps = await Promise.all(queries.map(async query => {
    const rows: z.infer<typeof stampRow>[] = [];
    for (let offset = 0; ; offset += 500) {
      const result = await query.range(offset, offset + 499);
      if (result.error || !result.data) {
        if (!initialRead) throw new ServiceOperationError(result.error, "database", "projects_revision", undefined, undefined, result.status);
        return ids.map(project_id => ({ project_id, unavailable: true }));
      }
      rows.push(...z.array(stampRow).parse(result.data));
      if (result.data.length < 500) return rows;
    }
  }));
  const templates = await db.rpc("marketplace_project_templates", { p_owner_user_id: user.id, p_project_ids: ids });
  if (templates.error && !initialRead) throw new ServiceOperationError(templates.error, "database", "projects_templates", undefined, undefined, templates.status);
  const templateIds = templates.error ? {} : z.record(z.string(), z.string()).parse(templates.data);
  const revisions = Object.fromEntries(data.projects.map(project => {
    const mediaRevision = digest(stamps.map(rows => rows.filter(row => row.project_id === project.id)));
    return [project.id, { mediaRevision, revision: digest([project, mediaRevision, templateIds[project.id] ?? null]) }];
  }));
  const changedIds = ids.filter(id => known[id] !== revisions[id].revision);
  if (!changedIds.length) return { ok: true, clerkUserId: user.clerk_user_id, data, changed: {} };
  const [statuses, assets] = await Promise.all([
    getProjectCardStatuses(changedIds).catch(error => {
      unstable_rethrow(error);
      if (!initialRead) throw error;
      return Object.fromEntries(changedIds.map(id => [id, "unavailable" as const]));
    }),
    db.from("project_assets").select("*").eq("owner_user_id", user.id).in("project_id", changedIds)
      .eq("upload_status", "uploaded").eq("removed_from_draft", false).in("media_type", ["image", "video"]).order("created_at").order("id"),
  ]);
  if (assets.error || !assets.data) throw new ServiceOperationError(assets.error, "database", "projects_media", undefined, undefined, assets.status);
  // In a large history one project can fill the batch before another project's
  // first source. Fetch only missing first sources instead of truncating them.
  if (assets.data.length >= 1000) await Promise.all(changedIds.filter(id => !assets.data.some(a => a.project_id === id)).map(async id => {
    const first = await db.from("project_assets").select("*").eq("owner_user_id", user.id).eq("project_id", id)
      .eq("upload_status", "uploaded").eq("removed_from_draft", false).in("media_type", ["image", "video"])
      .order("created_at").order("id").limit(1).maybeSingle();
    if (first.error) throw new ServiceOperationError(first.error, "database", "projects_media", undefined, undefined, first.status);
    if (first.data) assets.data.push(first.data);
  }));
  const changed: Record<string, GalleryCard> = {};
  for (const id of changedIds) {
    const asset = assets.data.find(a => a.project_id === id);
    changed[id] = { ...revisions[id], status: statuses[id] ?? null, listingId: templateIds[id],
      active: stamps[5].some(row => row.project_id === id && ["queued", "running"].includes(String(row.status))), preview: asset ? {
      id: asset.id, projectId: id, filename: asset.original_filename, mimeType: asset.mime_type, sizeBytes: asset.size_bytes,
      kind: asset.media_type, status: asset.upload_status, createdAt: asset.created_at,
    } : null };
  }
  return { ok: true, clerkUserId: user.clerk_user_id, data, changed };
}
