import "server-only";
import { promises as fs } from "node:fs";
import { runMediaCommand } from "@/lib/media-preparation/ffmpeg";
import type { FrozenPackage } from "./package";
import type { Run } from "./runtime-contract";
import { readPrivate, spoolFile, inspectVideo, publishPrivate, readSpool } from "./runtime-media";

export function approvedJoinInputs(doc: FrozenPackage, runs: Run[]) {
  if (doc.segments.length < 2) throw new Error("V3_JOIN_NOT_REQUIRED");
  return doc.segments.map(segment => {
    const run = runs.find(r => r.package_id === doc.id && r.intent.segmentId === segment.id);
    if (!run || run.state !== "approved" || !run.result || run.intent.segmentHash !== segment.fingerprint) throw new Error("V3_JOIN_REQUIRES_APPROVED_SEGMENTS");
    const lastScene = doc.source.storyboardContent.scenes.find(s => s.number === segment.includedSceneNumbers.at(-1));
    if (!lastScene || !["none", "cut"].includes(lastScene.transition.type)) throw new Error("V3_JOIN_TRANSITION_UNSUPPORTED");
    return { runId: run.id, asset: run.result, segmentId: segment.id };
  });
}
export async function joinV3Segments(id: string, doc: FrozenPackage, runs: Run[], signal: AbortSignal) {
  const ordered = approvedJoinInputs(doc, runs), paths: string[] = [];
  const saved = await readSpool(id, "video.mp4");
  if (saved) {
    const metadata = await inspectVideo(id, saved, { durationMs: doc.source.storyboardContent.durationMs, aspectRatio: doc.source.storyboardContent.aspectRatio, generateAudio: true });
    const asset = await publishPrivate(doc.source.scope.ownerId, doc.source.scope.projectId, id, saved, metadata, signal);
    return { asset, packageId: doc.id, packageHash: doc.hash, segments: ordered.map(s => ({ runId: s.runId, assetHash: s.asset.sha256, segmentId: s.segmentId })) };
  }
  for (const source of ordered) {
    const file = await spoolFile(source.runId, "join-source.mp4");
    await fs.writeFile(file, await readPrivate(source.asset.storageKey, source.asset.etag, source.asset.sizeBytes, signal, source.asset.sha256), { mode: 0o600 });
    paths.push(file);
  }
  const output = await spoolFile(id, "joined.mp4"), filters = paths.map((_, i) => `[${i}:v]setpts=PTS-STARTPTS[v${i}];[${i}:a]asetpts=PTS-STARTPTS[a${i}];`).join("") +
    paths.map((_, i) => `[v${i}][a${i}]`).join("") + `concat=n=${paths.length}:v=1:a=1[v][a]`;
  await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-y", "-threads", "1", "-filter_complex_threads", "1", "-protocol_whitelist", "file,pipe",
    ...paths.flatMap(file => ["-i", file]), "-filter_complex", filters, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "18", "-c:a", "aac", "-movflags", "+faststart", output]);
  const bytes = await fs.readFile(output), metadata = await inspectVideo(id, bytes, { durationMs: doc.source.storyboardContent.durationMs,
    aspectRatio: doc.source.storyboardContent.aspectRatio, generateAudio: true });
  const asset = await publishPrivate(doc.source.scope.ownerId, doc.source.scope.projectId, id, bytes, metadata, signal);
  return { asset, packageId: doc.id, packageHash: doc.hash, segments: ordered.map(s => ({ runId: s.runId, assetHash: s.asset.sha256, segmentId: s.segmentId })) };
}
