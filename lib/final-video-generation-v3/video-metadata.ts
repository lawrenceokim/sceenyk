import { projectVideoResolution, type VideoResolution } from "@/lib/projects/video-resolution";

export type VideoExpectation = { durationMs: number; aspectRatio: string; generateAudio: boolean; resolution?: VideoResolution };
export function assertV3VideoMetadata(meta: { width: number; height: number; durationMs: number; hasAudio: boolean }, expected: VideoExpectation) {
  const [w, h] = expected.aspectRatio.split(":").map(Number);
  const edge = Number.parseInt(projectVideoResolution(expected.resolution), 10);
  // Retain the existing technical tolerances; only the requested output edge changes.
  if (Math.abs(meta.durationMs - expected.durationMs) > 250 || Math.abs(meta.width / meta.height - w / h) > 0.01 ||
    Math.min(meta.width, meta.height) !== edge || expected.generateAudio && !meta.hasAudio)
    throw new Error("V3_VIDEO_TECHNICAL_VALIDATION_FAILED");
}
