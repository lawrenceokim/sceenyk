import "server-only";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { z } from "zod";
import { PreparationError } from "./contract";
import { preparationLimits, type normalization } from "./config";
import { milliseconds, validateSourceDuration } from "./timing";

const requireBinary = createRequire(import.meta.url);
function binary(kind: "ffmpeg" | "ffprobe") {
  const configured = process.env[kind === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"];
  if (configured) return configured;
  try { return kind === "ffmpeg" ? requireBinary("ffmpeg-static") as string : (requireBinary("ffprobe-static") as { path: string }).path; }
  catch { throw new PreparationError("PROCESSOR_UNAVAILABLE", true); }
}
export async function runMediaCommand(kind: "ffmpeg" | "ffprobe", args: string[]) {
  return new Promise<string>((resolve, reject) => {
    // No shell, source URLs, user filenames, or secret-bearing child environment.
    execFile(binary(kind), args, { windowsHide: true, encoding: "utf8", timeout: preparationLimits.processMs, killSignal: "SIGKILL", maxBuffer: 512 * 1024, env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP } }, (error, stdout) => {
      if (error) reject(new PreparationError(error.code === "ENOENT" ? "PROCESSOR_UNAVAILABLE" : error.killed ? "PROCESSOR_TIMEOUT" : "MEDIA_PROCESSING_FAILED", error.code === "ENOENT" || error.killed));
      else resolve(stdout);
    });
  });
}
const stream = z.object({ codec_type: z.string(), codec_name: z.string().optional(), pix_fmt: z.string().optional(), width: z.number().optional(), height: z.number().optional(), duration: z.string().optional(), avg_frame_rate: z.string().optional(), sample_aspect_ratio: z.string().optional(), tags: z.object({ rotate: z.string().optional() }).optional(), side_data_list: z.array(z.object({ rotation: z.number().optional() })).optional() });
function fraction(value: string | undefined, fallback = 1) { if (!value || value === "N/A") return fallback; const [a, b] = value.split(/[/:]/).map(Number); const result = a / (b ?? 1); return Number.isFinite(result) && result > 0 ? result : fallback; }
export async function probeMedia(file: string) {
  let raw;
  try { raw = JSON.parse(await runMediaCommand("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", file])); }
  catch (error) { if (error instanceof PreparationError) throw error; throw new PreparationError("SOURCE_DURATION_UNAVAILABLE"); }
  const result = z.object({ streams: z.array(stream), format: z.object({ duration: z.string().optional(), format_name: z.string().optional() }) }).safeParse(raw);
  if (!result.success) throw new PreparationError("UNSUPPORTED_CODEC");
  const video = result.data.streams.find(s => s.codec_type === "video");
  if (!video?.width || !video.height || video.width * video.height > 16_777_216) throw new PreparationError("UNSUPPORTED_CODEC");
  const duration = Number(video.duration ?? result.data.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new PreparationError("SOURCE_DURATION_UNAVAILABLE");
  const durationMs = milliseconds(duration);
  if (!durationMs || durationMs > preparationLimits.sourceMs) throw new PreparationError("SOURCE_DURATION_UNAVAILABLE");
  const rotation = Number(video.side_data_list?.find(s => s.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0);
  if (![0, 90, -90, 180, -180, 270, -270].includes(rotation)) throw new PreparationError("UNSUPPORTED_ORIENTATION");
  const sar = fraction(video.sample_aspect_ratio);
  const rotated = Math.abs(rotation) % 180 === 90;
  return { durationMs, width: rotated ? video.height : Math.round(video.width * sar), height: rotated ? Math.round(video.width * sar) : video.height, rotation, fps: fraction(video.avg_frame_rate, 0), hasAudio: result.data.streams.some(s => s.codec_type === "audio"), codec: video.codec_name, pixelFormat: video.pix_fmt, sar, container: result.data.format.format_name };
}
export function preparationShape(source: Awaited<ReturnType<typeof probeMedia>>, timing: { startMs: number; endMs: number; durationMs: number }, config: ReturnType<typeof normalization>) {
  validateSourceDuration(timing.endMs, source.durationMs);
  if (timing.durationMs > preparationLimits.segmentMs) throw new PreparationError("UNSUPPORTED_DURATION");
  const [rw, rh] = config.aspectRatio.split(":").map(Number);
  const ratio = rw / rh, sourceRatio = source.width / source.height;
  const sameAspect = Math.abs(sourceRatio - ratio) < .01;
  const fit = Math.min(1, config.maximumDimension / Math.max(source.width, source.height));
  const even = (v: number) => Math.max(2, Math.floor(v / 2) * 2);
  let width = even(source.width * fit), height = even(source.height * fit);
  const short = even(config.maximumDimension * 9 / 16);
  if (!sameAspect) { width = config.aspectRatio === "9:16" || config.aspectRatio === "1:1" ? short : config.maximumDimension; height = config.aspectRatio === "16:9" || config.aspectRatio === "1:1" ? short : config.maximumDimension; }
  const copy = timing.startMs === 0 && Math.abs(timing.endMs - source.durationMs) <= 1 && source.codec === config.codec && source.pixelFormat === config.pixelFormat && source.fps === config.fps && source.rotation === 0 && source.sar === 1 && source.width === width && source.height === height;
  return { width, height, copy };
}
export async function extractSegment(input: string, output: string, timing: { startMs: number; endMs: number; durationMs: number }, config: ReturnType<typeof normalization>) {
  const source = await probeMedia(input);
  const { width, height, copy } = preparationShape(source, timing, config);
  const even = (v: number) => Math.max(2, Math.floor(v / 2) * 2);
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-protocol_whitelist", "file,pipe", "-ss", (timing.startMs / 1000).toFixed(3), "-i", input, "-t", (timing.durationMs / 1000).toFixed(3), "-map", "0:v:0", "-an", "-sn", "-dn", "-map_metadata", "-1"];
  if (copy) args.push("-c:v", "copy");
  else {
    // Automatic display rotation is applied by FFmpeg before this fit/pad filter.
    const scale = Math.min(1, width / source.width, height / source.height);
    args.push("-vf", `scale=${even(source.width * scale)}:${even(source.height * scale)},setsar=1,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,fps=${config.fps}`, "-c:v", "libx264", "-preset", "fast", "-crf", String(config.crf), "-pix_fmt", config.pixelFormat, "-threads", "2");
  }
  args.push("-fs", String(preparationLimits.outputBytes + 1), "-movflags", "+faststart", "-f", "mp4", output);
  await runMediaCommand("ffmpeg", args);
  const prepared = await probeMedia(output);
  if (Math.abs(prepared.durationMs - timing.durationMs) > preparationLimits.durationToleranceMs || prepared.hasAudio || prepared.rotation !== 0 || prepared.width !== width || prepared.height !== height) throw new PreparationError("INVALID_PREPARED_OUTPUT");
  return { source, prepared, mode: copy ? "copy" as const : "transcode" as const };
}
