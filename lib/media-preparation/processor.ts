import "server-only";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { inspectR2Object, putR2SceneOutput, readR2AnalysisMedia } from "@/lib/storage/r2";
import { boundedBytes } from "@/lib/video-ai/storage";
import { loadPreparation } from "./context";
import { PreparationError } from "./contract";
import { normalization, normalizationKey, preparationLimits } from "./config";
import { segmentTiming } from "./timing";
import { extractSegment, probeMedia, preparationShape } from "./ffmpeg";

function overlays(plan: Awaited<ReturnType<typeof loadPreparation>>["plan"], order: number, assetId: string, startMs: number, endMs: number) {
  const scene = plan.scenePlan[order - 1];
  const evidence = [scene.description, scene.transformationInstruction ?? "", ...plan.editingNotes].join(" ");
  const types = ["caption", "logo", "hud", "label", "ui", "text"].filter(kind => new RegExp(`\\b${kind}s?\\b`, "i").test(evidence));
  return { status: types.length ? "plan_mentions" : "not_identified", types, restorationSource: { assetId, startMs, endMs }, compositionRequired: types.length > 0 };
}
// This module is imported only by the external processor, never by Next.js.
export async function executePreparation(input: unknown) {
  const { db, scene, source, plan, runId } = await loadPreparation(input);
  if (!scene.preparation_required || scene.provider_task_id || ["completed", "failed", "skipped"].includes(scene.status)) return { ready: !scene.preparation_required || scene.status === "completed" || !!scene.provider_task_id };
  if (!source || !source.verified_etag || source.media_type !== "video") throw new PreparationError("SOURCE_UNAVAILABLE");
  let timing;
  try { timing = segmentTiming(scene.source_start_ms, scene.source_end_ms, scene.requested_duration_ms); }
  catch {
    const failed = await db.rpc("record_visual_status", { p_scene_id: scene.id, p_run_id: runId, p_status: "failed", p_credits: null, p_error: "INVALID_SOURCE_TIMING" });
    if (failed.error || !failed.data) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
    return { ready: false };
  }
  const config = normalization(plan.aspectRatio), lease = randomUUID();
  if (source.size_bytes > preparationLimits.sourceBytes) {
    const failed = await db.rpc("record_visual_status", { p_scene_id: scene.id, p_run_id: runId, p_status: "failed", p_credits: null, p_error: "UNSUPPORTED_MEDIA" });
    if (failed.error || !failed.data) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
    return { ready: false };
  }
  const reserved = await db.rpc("reserve_source_segment", { p_scene_id: scene.id, p_run_id: runId, p_normalization_key: normalizationKey(config), p_normalization: config, p_overlays: overlays(plan, scene.scene_order, source.id, timing.startMs, timing.endMs), p_lease_id: lease });
  if (reserved.error || !reserved.data) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
  const claim = reserved.data;
  if (claim.state === "completed") return { ready: true };
  if (claim.state === "failed") return { ready: false };
  if (claim.state !== "claimed" || !claim.segment_id) throw new PreparationError("PREPARATION_BUSY", true);
  let dir: string | undefined;
  try {
    const selected = await db.from("prepared_segments").select("*").eq("id", claim.segment_id).eq("owner_user_id", scene.owner_user_id).eq("project_id", scene.project_id).single();
    if (selected.error || !selected.data) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
    const segment = selected.data;
    dir = await mkdtemp(path.join(tmpdir(), "sceenyk-segment-"));
    const original = path.join(dir, "source"), output = path.join(dir, "prepared.mp4");
    const stream = await readR2AnalysisMedia(source.storage_key, source.verified_etag, source.size_bytes, AbortSignal.timeout(60_000));
    const bytes = await boundedBytes(stream, preparationLimits.sourceBytes);
    if (bytes.length !== source.size_bytes || !["video/mp4", "video/webm"].includes((await fileTypeFromBuffer(bytes))?.mime ?? "")) throw new PreparationError("UNSUPPORTED_CODEC");
    await writeFile(original, bytes, { flag: "wx" });
    const existing = await inspectR2Object(segment.storage_key);
    let result;
    if (existing) {
      if (!existing.etag || !existing.sizeBytes || existing.sizeBytes > preparationLimits.outputBytes || existing.mimeType !== "video/mp4") throw new PreparationError("INVALID_PREPARED_OUTPUT");
      const stored = await readR2AnalysisMedia(segment.storage_key, existing.etag, existing.sizeBytes, AbortSignal.timeout(60_000));
      await writeFile(output, await boundedBytes(stored, preparationLimits.outputBytes), { flag: "wx" });
      const sourceProbe = await probeMedia(original), prepared = await probeMedia(output);
      const shape = preparationShape(sourceProbe, timing, config);
      if (prepared.width !== shape.width || prepared.height !== shape.height) throw new PreparationError("INVALID_PREPARED_OUTPUT");
      result = { source: sourceProbe, prepared, mode: shape.copy ? "copy" as const : "transcode" as const };
    } else result = await extractSegment(original, output, timing, config);
    const outputSize = (await stat(output)).size;
    if (outputSize > preparationLimits.outputBytes || Math.abs(result.prepared.durationMs - timing.durationMs) > preparationLimits.durationToleranceMs || result.prepared.hasAudio || result.prepared.rotation !== 0 || result.prepared.fps !== 24 || result.prepared.width > 1280 || result.prepared.height > 1280) throw new PreparationError("INVALID_PREPARED_OUTPUT");
    const outputBytes = await readFile(output);
    if ((await fileTypeFromBuffer(outputBytes))?.mime !== "video/mp4") throw new PreparationError("INVALID_PREPARED_OUTPUT");
    if (!existing) await putR2SceneOutput(segment.storage_key, outputBytes);
    const verified = await inspectR2Object(segment.storage_key);
    if (!verified?.etag || verified.sizeBytes !== outputSize || verified.mimeType !== "video/mp4") throw new PreparationError("PREPARATION_STORAGE_UNAVAILABLE", true);
    const metadata = { etag: verified.etag, sizeBytes: outputSize, sourceDurationMs: result.source.durationMs, durationMs: result.prepared.durationMs, width: result.prepared.width, height: result.prepared.height, fps: result.prepared.fps, sourceWidth: result.source.width, sourceHeight: result.source.height, sourceRotation: result.source.rotation, sourceHasAudio: result.source.hasAudio, mode: result.mode };
    const completed = await db.rpc("complete_source_segment", { p_scene_id: scene.id, p_run_id: runId, p_segment_id: segment.id, p_lease_id: lease, p_metadata: metadata });
    if (completed.error || !completed.data) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
    return { ready: true };
  } catch (error) {
    const failure = error instanceof PreparationError ? error : new PreparationError("PREPARATION_STORAGE_UNAVAILABLE", true);
    const saved = await db.rpc("fail_source_segment", { p_scene_id: scene.id, p_run_id: runId, p_segment_id: claim.segment_id, p_lease_id: lease, p_error: failure.code, p_permanent: !failure.temporary });
    if (saved.error || !saved.data) throw new PreparationError("PREPARATION_DATABASE_UNAVAILABLE", true);
    if (failure.temporary) throw failure;
    return { ready: false };
  } finally {
    // Only the fresh mkdtemp directory is recursively removed.
    if (dir) {
      const resolved = path.resolve(dir), root = path.resolve(tmpdir()) + path.sep;
      if (!resolved.startsWith(root) || !path.basename(resolved).startsWith("sceenyk-segment-")) throw new Error("TEMPORARY_PATH_INVALID");
      await rm(resolved, { recursive: true, force: true });
    }
  }
}
