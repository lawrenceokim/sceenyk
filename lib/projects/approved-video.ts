import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { V3Store } from "@/lib/final-video-generation-v3/runtime-store";
import { privateAssetSchema } from "@/lib/final-video-generation-v3/runtime-contract";
import { assetSchema } from "@/lib/final-video-generation/contract";

const snapshotSchema = z.object({
  project: z.object({ project_id: z.uuid(), owner_user_id: z.uuid() }),
  source: z.object({ current: z.boolean(), revision: z.number() }).nullable(),
  packages: z.array(z.object({ id: z.uuid(), document: z.object({ hash: z.string(), sourceRevision: z.number(), segments: z.array(z.unknown()) }) })),
  runs: z.array(z.object({ id: z.uuid(), package_id: z.uuid(), state: z.string(), current: z.boolean(), completed_at: z.string().nullable(), result: privateAssetSchema.nullable() })),
  artifacts: z.array(z.object({ id: z.uuid(), kind: z.string(), version: z.number(), approved_at: z.string().nullable(), rejected_at: z.string().nullable(), document: z.record(z.string(), z.unknown()) })),
});
export type ApprovedVideo = { version: string; storageKey: string; etag: string; sha256: string; sizeBytes: number };
function source(id: string, asset: Omit<ApprovedVideo, "version">): ApprovedVideo {
  return { ...asset, version: createHash("sha256").update(JSON.stringify(["projects-preview-v1", id, asset.storageKey, asset.etag, asset.sha256])).digest("hex") };
}

// A projection of saved approval evidence only. This never enrolls a project,
// repairs approvals, builds packages, or submits generation work.
export function approvedV3Video(data: unknown, owner: string, project: string): ApprovedVideo | null {
  const w = snapshotSchema.parse(data);
  if (w.project.project_id !== project || w.project.owner_user_id !== owner || !w.source?.current) return null;
  const packages = w.packages.filter(p => p.document.sourceRevision === w.source!.revision);
  const candidates = [
    ...w.runs.filter(r => r.current && r.state === "approved" && r.completed_at && r.result &&
      packages.some(p => p.id === r.package_id && p.document.segments.length === 1))
      .map(r => ({ id: r.id, at: r.completed_at!, asset: r.result! })),
    ...w.artifacts.filter(a => a.kind === "joined" && a.approved_at && !a.rejected_at &&
      packages.some(p => p.id === a.document.packageId && p.document.hash === a.document.packageHash &&
        w.runs.filter(r => r.package_id === p.id).every(r => r.current)))
      .map(a => ({ id: a.id, at: a.approved_at!, asset: privateAssetSchema.parse(a.document.asset) })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const final = candidates[0];
  if (!final || final.asset.mimeType !== "video/mp4" || final.asset.durationMs < 3000 ||
    final.asset.storageKey !== `users/${owner}/projects/${project}/v3/${final.asset.id}.mp4`) return null;
  return source(final.id, { storageKey: final.asset.storageKey, etag: final.asset.etag, sha256: final.asset.sha256, sizeBytes: final.asset.sizeBytes });
}

export async function resolveApprovedProjectVideo(owner: string, project: string): Promise<ApprovedVideo | null> {
  z.uuid().parse(owner); z.uuid().parse(project);
  const db = createDatabaseClient();
  const owned = await db.from("projects").select("id").eq("id", project).eq("owner_user_id", owner).is("deleted_at", null).maybeSingle();
  if (owned.error) throw new Error("PROJECT_PREVIEW_READ_FAILED");
  if (!owned.data) return null;
  const workspace = await new V3Store().rpc("ugc_v3_runtime_read", { p_owner: owner, p_project: project });
  if (workspace) return approvedV3Video(workspace, owner, project);
  const result = await db.from("ugc_final_executions").select("id,job_id,final_asset,approved_at")
    .eq("owner_user_id", owner).eq("project_id", project).eq("state", "approved").not("approved_at", "is", null)
    .order("approved_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error("PROJECT_PREVIEW_READ_FAILED");
  if (!result.data?.final_asset) return null;
  // Reuse the legacy pipeline's current-input fence as well as its approval.
  const current = await db.rpc("ugc_final_current", { p_execution: result.data.id });
  if (current.error) throw new Error("PROJECT_PREVIEW_READ_FAILED");
  if (!current.data) return null;
  const asset = assetSchema.parse(result.data.final_asset);
  const prefix = `ugc/${owner}/${project}/${result.data.job_id}/final-video-v1/${result.data.id}/`;
  if (asset.mimeType !== "video/mp4" || asset.durationMs < 3000 || !asset.key.startsWith(prefix) ||
    !/^[a-f0-9-]{36}\.mp4$/.test(asset.key.slice(prefix.length))) return null;
  return source(result.data.id, { storageKey: asset.key, etag: asset.etag, sha256: asset.sha256, sizeBytes: asset.sizeBytes });
}
