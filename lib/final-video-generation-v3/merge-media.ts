import "server-only";
import { promises as fs } from "node:fs";
import { runMediaCommand } from "@/lib/media-preparation/ffmpeg";
import { assertV3VideoMetadata } from "./video-metadata";
import type { VideoResolution } from "@/lib/projects/video-resolution";

type Stream = { codec_type: string; codec_name?: string; profile?: string; level?: number; width?: number; height?: number;
  pix_fmt?: string; sample_aspect_ratio?: string; time_base?: string; avg_frame_rate?: string; r_frame_rate?: string;
  extradata_hash?: string; start_time?: string; duration?: string; channels?: number; channel_layout?: string; sample_rate?: string; bit_rate?: string;
  tags?: { rotate?: string }; side_data_list?: { rotation?: number }[] };
export type MergeExpectation = { resolution: VideoResolution; aspectRatio: string; durationMs: number };
const common = ["-v", "error", "-nostdin", "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-protocol_whitelist", "file,pipe"];
const seconds = (ms: number) => (ms / 1000).toFixed(6);
function positive(value: string | undefined) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : 0; }
function frameRate(value: string | undefined) { const [a, b] = (value ?? "0/1").split("/").map(Number); return a / (b ?? 1); }

export async function probeMergeFile(file: string) {
  const raw = JSON.parse(await runMediaCommand("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-show_data_hash", "sha256", "-of", "json", file])) as { streams?: Stream[]; format?: { duration?: string; format_name?: string } };
  const videos = raw.streams?.filter(s => s.codec_type === "video") ?? [], audios = raw.streams?.filter(s => s.codec_type === "audio") ?? [];
  const video = videos[0], audio = audios[0];
  const durationMs = Math.round(positive(raw.format?.duration) * 1000), videoMs = Math.round(positive(video?.duration) * 1000);
  if (videos.length !== 1 || audios.length !== 1 || !video?.width || !video.height || !videoMs || !durationMs ||
    !raw.format?.format_name?.includes("mp4") || !audio?.channels || !positive(audio.sample_rate) ||
    !Number.isFinite(frameRate(video.avg_frame_rate)) || frameRate(video.avg_frame_rate) <= 0 || frameRate(video.avg_frame_rate) > 120 ||
    Number(video.tags?.rotate ?? 0) !== 0 || video.side_data_list?.some(d => Number(d.rotation ?? 0) !== 0) ||
    ![undefined, "1:1", "N/A"].includes(video.sample_aspect_ratio) || video.width * video.height > 4096 * 4096 ||
    !positive(audio.duration) || Math.abs(positive(audio.duration) * 1000 - videoMs) > 250 ||
    !Number.isFinite(Number(video.start_time ?? 0)) || !Number.isFinite(Number(audio.start_time ?? 0)) ||
    Math.abs(Number(video.start_time ?? 0) - Number(audio.start_time ?? 0)) > .25)
    throw new Error("V3_MERGE_SOURCE_INVALID");
  return { video, audio, videoMs, durationMs, width: video.width, height: video.height, hasAudio: true };
}

function videoSignature(v: Stream) {
  return JSON.stringify([v.codec_name, v.profile, v.level, v.width, v.height, v.pix_fmt, v.sample_aspect_ratio,
    v.time_base, v.avg_frame_rate, v.r_frame_rate, v.extradata_hash]);
}
export async function validateMergedFile(file: string, expected: MergeExpectation, actualTotalMs: number) {
  const meta = await probeMergeFile(file);
  assertV3VideoMetadata(meta, { ...expected, durationMs: actualTotalMs, generateAudio: true });
  // Decode errors must fail the merge, not become a damaged review artifact.
  await runMediaCommand("ffmpeg", [...common, "-xerror", "-err_detect", "explode", "-i", file, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"]);
  return { mimeType: "video/mp4" as const, width: meta.width, height: meta.height, durationMs: meta.durationMs, hasAudio: true };
}

/** File-only FFmpeg boundary. Inputs are task-owned copies, never source asset paths. */
export async function mergeLocalFiles(inputs: { file: string; durationMs: number }[], output: string, listFile: string,
  expected: MergeExpectation, signal: AbortSignal) {
  if (inputs.length < 2) throw new Error("V3_MERGE_REQUIRES_APPROVED_CLIPS");
  const probes: Awaited<ReturnType<typeof probeMergeFile>>[] = [];
  for (const input of inputs) {
    signal.throwIfAborted();
    const meta = await probeMergeFile(input.file);
    assertV3VideoMetadata(meta, { ...expected, durationMs: input.durationMs, generateAudio: true });
    if (Math.abs(meta.videoMs - input.durationMs) > 250) throw new Error("V3_MERGE_SOURCE_INVALID");
    await runMediaCommand("ffmpeg", [...common, "-xerror", "-err_detect", "explode", "-i", input.file, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"]);
    probes.push(meta);
  }
  const first = probes[0], durationMs = probes.reduce((n, p) => n + p.videoMs, 0);
  if (Math.abs(durationMs - expected.durationMs) > inputs.length * 250 + 50) throw new Error("V3_MERGE_DURATION_INVALID");
  const channels = Math.max(...probes.map(p => p.audio.channels!));
  const layout = channels === 1 ? "mono" : channels === 2 ? "stereo" : first.audio.channel_layout;
  if (!layout || channels > 2 && probes.some(p => p.audio.channel_layout !== layout)) throw new Error("V3_MERGE_AUDIO_INCOMPATIBLE");
  const sampleRate = Math.max(...probes.map(p => positive(p.audio.sample_rate)));
  const audioBitrate = Math.max(192000, ...probes.map(p => positive(p.audio.bit_rate)));
  const audioFilters = (offset: number) => probes.map((p, i) =>
    `[${i + offset}:a:0]asetpts=PTS-${Number(p.video.start_time ?? 0)}/TB,aresample=${sampleRate}:async=0:first_pts=0,aformat=sample_fmts=fltp:channel_layouts=${layout},atrim=duration=${seconds(p.videoMs)},apad=whole_dur=${seconds(p.videoMs)},asetpts=N/SR/TB[a${i}]`).join(";") +
    ";" + probes.map((_, i) => `[a${i}]`).join("") + `concat=n=${inputs.length}:v=0:a=1[a]`;
  const finish = ["-c:a", "aac", "-b:a", String(audioBitrate), "-map_metadata", "-1", "-movflags", "+faststart", "-fs", String(256 * 1024 * 1024), output];
  let copy = ["h264", "hevc"].includes(first.video.codec_name ?? "") && !!first.video.extradata_hash && probes.every(p =>
    videoSignature(p.video) === videoSignature(first.video) && Math.abs(Number(p.video.start_time ?? 0)) < .001 && p.video.avg_frame_rate === p.video.r_frame_rate);
  if (copy) {
    // Explicit video durations prevent AAC/container tails from introducing video gaps.
    await fs.writeFile(listFile, "ffconcat version 1.0\n" + inputs.map((input, i) =>
      `file '${input.file.replaceAll("\\", "/").replaceAll("'", "'\\''")}'\nduration ${seconds(probes[i].videoMs)}`).join("\n") + "\n", { mode: 0o600 });
    try {
      await runMediaCommand("ffmpeg", [...common, "-f", "concat", "-safe", "0", "-i", listFile, ...inputs.flatMap(i => ["-i", i.file]),
        "-filter_complex", audioFilters(1), "-map", "0:v:0", "-c:v", "copy", "-map", "[a]", ...finish]);
      signal.throwIfAborted();
      const metadata = await validateMergedFile(output, expected, durationMs);
      return { metadata, mode: "copy-video" as const, inputDurationMs: durationMs };
    } catch (error) {
      signal.throwIfAborted();
      if (error instanceof Error && error.message === "PROCESSOR_UNAVAILABLE") throw error;
      copy = false;
    }
  }
  if (!copy) {
    const sameFps = probes.every(p => p.video.avg_frame_rate === first.video.avg_frame_rate && p.video.r_frame_rate === first.video.r_frame_rate);
    const fps = first.video.avg_frame_rate!;
    const videoFilters = probes.map((p, i) => `[${i}:v:0]setpts=PTS-STARTPTS,setsar=1${p.width !== first.width || p.height !== first.height ? `,scale=${first.width}:${first.height}:flags=lanczos` : ""}${!sameFps ? `,fps=${fps}` : ""},format=yuv420p[v${i}]`).join(";") +
      ";" + probes.map((_, i) => `[v${i}]`).join("") + `concat=n=${inputs.length}:v=1:a=0[v];` + audioFilters(0);
    await runMediaCommand("ffmpeg", [...common, ...inputs.flatMap(i => ["-i", i.file]), "-filter_complex", videoFilters,
      "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-fps_mode", "vfr", ...finish]);
  }
  signal.throwIfAborted();
  const metadata = await validateMergedFile(output, expected, durationMs);
  return { metadata, mode: "normalized-video" as const, inputDurationMs: durationMs };
}
