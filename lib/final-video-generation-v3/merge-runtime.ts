import "server-only";
import { v3Digest } from "./identity";
import { isApprovedPackageSnapshot, type FrozenPackage } from "./package";
import { privateAssetSchema, type Artifact, type Run } from "./runtime-contract";
import type { RuntimeWorkspace } from "./runtime-store";
import { assertApprovedVideoMetadata, assertV3VideoMetadata } from "./video-metadata";

// Same ordered contract as M5's saved preparation event. No paid authority is read.
export function mergeManifest(doc: FrozenPackage, runs: Run[]) {
  const story = doc.source.storyboardContent;
  if (story.version !== "director-storyboard-connected-v1" || doc.segments.length < 2 || story.clips.length !== doc.segments.length)
    throw new Error("V3_MERGE_REQUIRES_APPROVED_CLIPS");
  const clips = doc.segments.map((s, i) => {
    const clip = story.clips[i];
    const run = runs.filter(r => r.package_id === doc.id && r.intent.segmentId === s.id).at(-1);
    if (!run || run.state !== "approved" || !run.result || run.intent.packageHash !== doc.hash || run.intent.segmentHash !== s.fingerprint ||
      clip.number !== i + 1 || clip.startMs !== s.startMs || clip.endMs !== s.endMs || clip.durationMs !== s.durationMs)
      throw new Error("V3_MERGE_REQUIRES_APPROVED_CLIPS");
    const asset = privateAssetSchema.parse(run.result);
    // Accepted immutable assets are not reinterpreted by later admission policy.
    // The merge worker still validates the actual source bytes/streams before use.
    (isApprovedPackageSnapshot(doc) ? assertApprovedVideoMetadata : assertV3VideoMetadata)(asset, { durationMs: s.durationMs, aspectRatio: story.aspectRatio, resolution: doc.source.resolution, generateAudio: true });
    if (asset.id !== run.id || asset.mimeType !== "video/mp4" || !asset.hasAudio ||
      asset.storageKey !== `users/${doc.source.scope.ownerId}/projects/${doc.source.scope.projectId}/v3/${run.id}.mp4`)
      throw new Error("V3_MERGE_SOURCE_INVALID");
    return { clipId: clip.id, number: i + 1, segmentId: s.id, runId: run.id, startMs: s.startMs, endMs: s.endMs, durationMs: s.durationMs, asset };
  });
  const manifest = { schema: "v3-clip-merge-preparation-v1" as const, packageId: doc.id, packageHash: doc.hash,
    storyboard: doc.source.storyboard, resolution: doc.source.resolution, aspectRatio: story.aspectRatio, clips };
  return { ...manifest, hash: v3Digest("clip-merge-preparation", manifest) };
}
export type MergeManifest = ReturnType<typeof mergeManifest>;

export function mergedArtifactCurrent(w: RuntimeWorkspace, doc: FrozenPackage, artifact: Artifact) {
  if (!w.source?.current || w.source.revision !== doc.sourceRevision || artifact.document.packageHash !== doc.hash ||
    w.runs.filter(r => r.package_id === doc.id).some(r => !r.current)) return false;
  try {
    const manifest = mergeManifest(doc, w.runs);
    return artifact.document.manifestHash === manifest.hash &&
      v3Digest("merged-segments", artifact.document.segments) === v3Digest("merged-segments", manifest.clips.map(c => ({ runId: c.runId, assetHash: c.asset.sha256, segmentId: c.segmentId })));
  } catch { return false; }
}
