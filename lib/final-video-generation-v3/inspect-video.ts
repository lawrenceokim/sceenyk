import "server-only";
import { measure } from "@/lib/final-video-generation/media";
import { assertV3VideoMetadata, type VideoExpectation } from "./video-metadata";
import { saveSpool } from "./runtime-media";

// Worker-only processor dependency. Web readers/review actions use runtime-media
// without importing FFmpeg, FFprobe or the legacy final-video recovery tree.
export async function inspectVideo(id: string, bytes: Buffer, expected: VideoExpectation) {
  if (!bytes.length || bytes.length > 256 * 1024 * 1024) throw new Error("V3_VIDEO_SIZE_INVALID");
  const file = await saveSpool(id, "video.mp4", bytes), meta = await measure(file, "video/mp4");
  assertV3VideoMetadata(meta, expected);
  return { mimeType: "video/mp4" as const, width: meta.width, height: meta.height, durationMs: meta.durationMs, hasAudio: meta.hasAudio };
}
