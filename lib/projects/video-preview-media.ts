import "server-only";
import { promises as fs } from "node:fs";
import { runMediaCommand, probeMedia } from "@/lib/media-preparation/ffmpeg";

export const previewMaximumBytes = 2 * 1024 * 1024;
export async function encodeProjectVideoPreview(input: string, output: string) {
  await runMediaCommand("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-protocol_whitelist", "file,pipe",
    "-i", input, "-t", "3", "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1",
    "-vf", "scale=w='min(480,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=15",
    "-c:v", "libx264", "-preset", "fast", "-crf", "30", "-pix_fmt", "yuv420p", "-threads", "2",
    "-fs", String(previewMaximumBytes + 1), "-movflags", "+faststart", "-f", "mp4", output,
  ]);
  const metadata = await probeMedia(output), stat = await fs.stat(output);
  if (Math.abs(metadata.durationMs - 3000) > 70 || metadata.hasAudio || metadata.codec !== "h264" ||
    metadata.width > 480 || metadata.height > 480 || stat.size > previewMaximumBytes || stat.size < 1) throw new Error("PROJECT_PREVIEW_INVALID_OUTPUT");
}
