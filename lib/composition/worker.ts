import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";
import { fileTypeFromBuffer } from "file-type";
import { createDatabaseClient } from "@/lib/db/server";
import { workerPreparationRequest } from "@/lib/media-preparation/context";
import { PreparationError } from "@/lib/media-preparation/contract";
import { probeMedia } from "@/lib/media-preparation/ffmpeg";
import { inspectR2Object, readR2AnalysisMedia } from "@/lib/storage/r2";
import { boundedBytes } from "@/lib/video-ai/storage";

const assetSchema = z.strictObject({ kind: z.enum(["scene_asset", "prepared_segment", "project_asset", "narration_asset"]), id: z.uuid(), storage_key: z.string().min(1), verified_etag: z.string().min(1), size_bytes: z.number().int().positive().max(104_857_600), mime_type: z.string(), duration_ms: z.number().int().positive().max(600_000).nullable(), is_static: z.boolean() });
const unavailable = () => new PreparationError("COMPOSITION_DATABASE_UNAVAILABLE", true);

// Worker-only. There are no provider imports or writes to produced media.
export async function inspectCompositionScene(input: unknown) {
  const ref = workerPreparationRequest.parse(input), db = createDatabaseClient();
  const job = await db.from("generation_jobs").select("id,owner_user_id,project_id,status,audio_ready_at,composition_run_id,composition_ready_at,composition_pending_at").eq("id", ref.generationJobId).maybeSingle();
  if (job.error) throw unavailable();
  const j = job.data;
  if (!j || j.status !== "processing" || !j.audio_ready_at || !j.composition_run_id) throw new PreparationError("SOURCE_UNAVAILABLE");
  const scene = await db.from("scene_executions").select("id").eq("id", ref.sceneExecutionId).eq("job_id", j.id).eq("owner_user_id", j.owner_user_id).eq("project_id", j.project_id).maybeSingle();
  const reservation = await db.from("generation_reservations").select("state").eq("job_id", j.id).eq("owner_user_id", j.owner_user_id).maybeSingle();
  if (scene.error || reservation.error) throw unavailable();
  if (!scene.data || reservation.data?.state !== "reserved") throw new PreparationError("SOURCE_UNAVAILABLE");
  if (j.composition_ready_at || j.composition_pending_at) return { ready: !!j.composition_ready_at };
  for (const track of ["visual", "narration"] as const) {
    const resolved = await db.rpc("composition_asset_ref", { p_scene_id: ref.sceneExecutionId, p_track: track });
    if (resolved.error) throw unavailable();
    if (!resolved.data) continue; // Planner persists the required-asset issue.
    const parsed = assetSchema.safeParse(resolved.data);
    if (!parsed.success) throw new PreparationError("SOURCE_UNAVAILABLE");
    const a = parsed.data;
    // Defense in depth: even trusted catalog references cannot request other namespaces.
    if (!a.storage_key.startsWith(`users/${j.owner_user_id}/projects/${j.project_id}/`)) throw new PreparationError("SOURCE_UNAVAILABLE");
    const cached = await db.from("composition_asset_checks").select("verified_etag").eq("asset_kind", a.kind).eq("asset_id", a.id).eq("owner_user_id", j.owner_user_id).eq("project_id", j.project_id).maybeSingle();
    if (cached.error) throw unavailable();
    if (cached.data?.verified_etag === a.verified_etag) continue;
    let duration = a.duration_ms, issue: "VISUAL_UNAVAILABLE" | "NARRATION_UNAVAILABLE" | "DURATION_UNAVAILABLE" | null = null;
    let directory: string | undefined;
    try {
      const object = await inspectR2Object(a.storage_key);
      if (!object || object.etag !== a.verified_etag || object.sizeBytes !== a.size_bytes || object.mimeType !== a.mime_type || (await fileTypeFromBuffer(object.header))?.mime !== a.mime_type) issue = track === "visual" ? "VISUAL_UNAVAILABLE" : "NARRATION_UNAVAILABLE";
      else if (!a.is_static && duration === null) {
        directory = await mkdtemp(path.join(tmpdir(), "sceenyk-composition-"));
        const file = path.join(directory, "visual");
        const stream = await readR2AnalysisMedia(a.storage_key, a.verified_etag, a.size_bytes, AbortSignal.timeout(60_000));
        const bytes = await boundedBytes(stream, 104_857_600);
        if (bytes.length !== a.size_bytes || (await fileTypeFromBuffer(bytes))?.mime !== a.mime_type) issue = "VISUAL_UNAVAILABLE";
        else {
          await writeFile(file, bytes, { flag: "wx" });
          try { duration = (await probeMedia(file)).durationMs; }
          catch (error) {
            if (error instanceof PreparationError && !error.temporary) issue = "DURATION_UNAVAILABLE";
            else throw error;
          }
        }
      }
    } finally {
      if (directory) {
        const resolved = path.resolve(directory), root = path.resolve(tmpdir()) + path.sep;
        if (!resolved.startsWith(root) || !path.basename(resolved).startsWith("sceenyk-composition-")) throw new Error("TEMPORARY_PATH_INVALID");
        await rm(resolved, { recursive: true, force: true });
      }
    }
    const saved = await db.rpc("record_composition_asset_check", { p_job_id: j.id, p_run_id: j.composition_run_id, p_scene_id: ref.sceneExecutionId, p_track: track, p_duration_ms: duration, p_issue: issue });
    if (saved.error || !saved.data) throw unavailable();
  }
  return { ready: true };
}
