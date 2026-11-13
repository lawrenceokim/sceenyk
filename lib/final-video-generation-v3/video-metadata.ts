import { projectVideoResolution, type VideoResolution } from "@/lib/projects/video-resolution";

export type VideoExpectation = { durationMs: number; aspectRatio: string; generateAudio: boolean; resolution?: VideoResolution };
type Metadata = { width: number; height: number; durationMs: number; hasAudio: boolean; technicalValidationVersion?: string };
export const nativeVideoValidationVersion = "seedance-25-native-v2" as const;
// BytePlus Seedance 2.5 output table; 480p is a provider tier, not a fixed
// shortest edge. Live Higgsfield 480p/1:1 result independently verified 640x640.
// https://console.byteplus.com/ark/region%3Aap-southeast-1/docs/create-video-generation-task-api
export const native480Dimensions: Readonly<Record<string, readonly [number, number]>> = Object.freeze({
  "16:9": [854, 480], "4:3": [752, 560], "1:1": [640, 640],
  "3:4": [560, 752], "9:16": [480, 854], "21:9": [992, 432],
});
export class V3VideoValidationError extends Error {
  constructor(readonly reasons: string[], readonly actual: Metadata, readonly expected: VideoExpectation) {
    super("V3_VIDEO_TECHNICAL_VALIDATION_FAILED");
  }
}
export function assertV3VideoMetadata(meta: Metadata, expected: VideoExpectation) {
  const reasons: string[] = [];
  if (![meta.width, meta.height, meta.durationMs, expected.durationMs].every(n => Number.isSafeInteger(n) && n > 0)) reasons.push("INVALID_MEASUREMENT");
  if (Math.abs(meta.durationMs - expected.durationMs) > 250) reasons.push("DURATION_MISMATCH");
  if (expected.generateAudio && !meta.hasAudio) reasons.push("AUDIO_MISSING");
  const shape = projectVideoResolution(expected.resolution) === "480p" ? native480Dimensions[expected.aspectRatio] : undefined;
  const native = !!shape && meta.width === shape[0] && meta.height === shape[1];
  if (!native) {
    const [w, h] = expected.aspectRatio.split(":").map(Number);
    if (!w || !h || Math.abs(meta.width / meta.height - w / h) > 0.01) reasons.push("ASPECT_RATIO_MISMATCH");
    if (Math.min(meta.width, meta.height) !== Number.parseInt(projectVideoResolution(expected.resolution), 10)) reasons.push("RESOLUTION_MISMATCH");
  }
  if (reasons.length) throw new V3VideoValidationError(reasons, meta, expected);
}
export function assertApprovedVideoMetadata(meta: Metadata, expected: VideoExpectation) {
  return meta.technicalValidationVersion === nativeVideoValidationVersion ? assertV3VideoMetadata(meta, expected) : assertLockedVideoMetadataV1(meta, expected);
}
// Persisted approval compatibility contract. Introduce a new version rather
// than reinterpret assets already approved against these exact tolerances.
export function assertLockedVideoMetadataV1(meta: { width: number; height: number; durationMs: number; hasAudio: boolean }, expected: VideoExpectation) {
  const [w, h] = expected.aspectRatio.split(":").map(Number);
  const edge = Number.parseInt(projectVideoResolution(expected.resolution), 10);
  // Retain the existing technical tolerances; only the requested output edge changes.
  if (Math.abs(meta.durationMs - expected.durationMs) > 250 || Math.abs(meta.width / meta.height - w / h) > 0.01 ||
    Math.min(meta.width, meta.height) !== edge || expected.generateAudio && !meta.hasAudio)
    throw new Error("V3_VIDEO_TECHNICAL_VALIDATION_FAILED");
}
