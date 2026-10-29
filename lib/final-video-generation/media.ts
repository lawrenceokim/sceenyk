import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { runMediaCommand } from "@/lib/media-preparation/ffmpeg";
import { FinalVideoError, type FinalAsset, type FinalExecution } from "./contract";
import { dimensions } from "./planning";
import { recoveryFile, spool } from "./storage";
import { checkComposition, compositionProfile, type CompositionPlan } from "./composition";

export async function measure(file: string, mimeType: FinalAsset["mimeType"]) {
  const data = JSON.parse(await runMediaCommand("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", file])) as {
    streams: { codec_type: string; codec_name: string; width?: number; height?: number; sample_rate?: string; channels?: number; duration?: string }[];
    format: { duration?: string; format_name?: string } };
  const video = data.streams?.find(stream => stream.codec_type === "video"), audio = data.streams?.find(stream => stream.codec_type === "audio");
  const durationMs = Math.round(Number(data.format?.duration) * 1000);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > 120_000 ||
    (mimeType === "video/mp4" ? !video?.width || !video.height || !data.format.format_name?.includes("mp4") : !audio) ||
    (video && (video.width! * video.height! > 1920 * 1920))) throw new FinalVideoError("FINAL_MEDIA_INVALID");
  await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", file, "-f", "null", "-"]);
  return { mimeType, durationMs, width: video?.width ?? 0, height: video?.height ?? 0,
    hasAudio: !!audio, sampleRate: Number(audio?.sample_rate ?? 0), channels: audio?.channels ?? 0 };
}
export function validateVideo(metadata: Awaited<ReturnType<typeof measure>>, durationMs: number, ratio: string, requiresAudio = false) {
  const { width, height } = dimensions(ratio);
  if (Math.abs(metadata.durationMs - durationMs) > 50 || !metadata.width ||
    Math.abs(metadata.width / metadata.height - width / height) > 0.005 || requiresAudio && !metadata.hasAudio)
    throw new FinalVideoError("FINAL_VIDEO_VALIDATION_FAILED");
}
const common = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1", "-protocol_whitelist", "file,pipe"];
export async function verifyCompositionProcessor(plan: CompositionPlan, hasAudio: boolean) {
  const [filters, encoders] = await Promise.all([
    runMediaCommand("ffmpeg", ["-hide_banner", "-filters"]), runMediaCommand("ffmpeg", ["-hide_banner", "-encoders"]),
    runMediaCommand("ffprobe", ["-v", "error", "-version"]),
  ]);
  const required = ["fps", "scale", "format", "concat", "settb", "setpts", "tpad"];
  if (plan.scenes.some(s => s.transition.type === "crossfade")) required.push("xfade");
  if (plan.scenes.some(s => s.transition.type.startsWith("fade_"))) required.push("fade");
  if (hasAudio) required.push("amix", "adelay", "apad", "atrim", "aresample", "aformat", "asetpts", "atempo");
  if (required.some(name => !new RegExp(`\\s${name}\\s`).test(filters)) || !/\slibx264\s/.test(encoders) || hasAudio && (!/\saac\s/.test(encoders) || !/\spcm_s16le\s/.test(encoders)))
    throw new FinalVideoError("FINAL_COMPOSITION_PROCESSOR_UNSUPPORTED");
}
export async function normalizeVisual(run: FinalExecution, bytes: Buffer, durationMs: number, ratio: string) {
  const source = await spool(run, randomUUID(), "input.mp4", bytes);
  const metadata = await measure(source, "video/mp4"); validateVideo(metadata, durationMs, ratio);
  const output = await recoveryFile(run, randomUUID(), "normalized.mp4"); const { width, height } = dimensions(ratio);
  await runMediaCommand("ffmpeg", [...common, "-i", source, "-t", (durationMs / 1000).toFixed(3), "-map", "0:v:0", "-an", "-sn", "-dn",
    "-vf", `scale=${width}:${height},setsar=1,fps=25,tpad=stop_mode=clone:stop_duration=${durationMs / 1000}`, "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "1", "-map_metadata", "-1", "-movflags", "+faststart", "-fs", "100000000", output]);
  const normalized = await measure(output, "video/mp4"); validateVideo(normalized, durationMs, ratio);
  return { bytes: await fs.readFile(output), metadata: normalized };
}
export async function alignedAudio(run: FinalExecution, parts: { bytes: Buffer; offsetMs: number; windowMs: number }[], durationMs: number) {
  const inputs: string[] = []; const filters: string[] = [];
  for (const [index, part] of parts.entries()) {
    if (!Number.isSafeInteger(part.offsetMs) || !Number.isSafeInteger(part.windowMs) || part.offsetMs < 0 || part.windowMs <= 0 ||
      part.offsetMs + part.windowMs > durationMs) throw new FinalVideoError("FINAL_SPEECH_TIMING");
    const input = await spool(run, randomUUID(), "speech.mp3", part.bytes); const metadata = await measure(input, "audio/mpeg");
    if (metadata.durationMs > part.windowMs + 50) throw new FinalVideoError("FINAL_SPEECH_TIMING");
    inputs.push("-i", input);
    filters.push(`[${index}:a]asetpts=PTS-STARTPTS,adelay=${part.offsetMs}:all=1,apad,atrim=duration=${durationMs / 1000},aresample=48000[a${index}]`);
  }
  const output = await recoveryFile(run, randomUUID(), "guide.mp3");
  if (!parts.length) throw new FinalVideoError("FINAL_AUDIO_MISSING");
  const mix = parts.map((_, index) => `[a${index}]`).join("");
  filters.push(`${mix}amix=inputs=${parts.length}:normalize=0:duration=longest[out]`);
  await runMediaCommand("ffmpeg", [...common, ...inputs, "-filter_complex", filters.join(";"), "-map", "[out]", "-t", String(durationMs / 1000),
    "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "48000", "-ac", "1", "-map_metadata", "-1", output]);
  return { bytes: await fs.readFile(output), metadata: await measure(output, "audio/mpeg") };
}
export async function muxScene(run: FinalExecution, video: Buffer, audio: Buffer | null, durationMs: number, ratio: string, forceSilentAudio = false) {
  const input = await spool(run, randomUUID(), "source.mp4", video);
  const output = await recoveryFile(run, randomUUID(), "scene.mp4");
  const args = [...common, "-i", input];
  if (audio) args.push("-i", await spool(run, randomUUID(), "track.mp3", audio));
  else if (forceSilentAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono");
  args.push("-map", "0:v:0", "-c:v", "copy");
  if (audio || forceSilentAudio) args.push("-map", "1:a:0", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1");
  else args.push("-an");
  args.push("-t", String(durationMs / 1000), "-map_metadata", "-1", "-movflags", "+faststart", output);
  await runMediaCommand("ffmpeg", args); const metadata = await measure(output, "video/mp4");
  validateVideo(metadata, durationMs, ratio, !!audio || forceSilentAudio); return { bytes: await fs.readFile(output), metadata };
}
export async function stitch(run: FinalExecution, scenes: Iterable<Buffer> | AsyncIterable<Buffer>, durationMs: number, ratio: string, hasAudio: boolean, plan?: CompositionPlan) {
  if (plan && (plan.version !== compositionProfile.version || plan.frameRate !== 25 || plan.totalDurationMs !== durationMs ||
    checkComposition({ totalDurationMs: durationMs, scenes: plan.scenes.map(scene => ({ ...scene,
      transition: { type: scene.transition.type, durationMs: scene.transition.durationMs }, audio: { background: "None", effects: "None", music: "None" }, speech: [] })) }).issues.length))
    throw new FinalVideoError("FINAL_COMPOSITION_PLAN_INVALID");
  const inputFiles: string[] = [];
  for await (const bytes of scenes) {
    let value = bytes; const file = await spool(run, randomUUID(), "part.mp4", value);
    const metadata = await measure(file, "video/mp4");
    if (plan) {
      const segment = plan.scenes[inputFiles.length];
      if (!segment) throw new FinalVideoError("FINAL_COMPOSITION_SCENE_COUNT");
      validateVideo(metadata, segment.durationMs, ratio);
    }
    if (hasAudio && !metadata.hasAudio) value = (await muxScene(run, value, null, metadata.durationMs, ratio, true)).bytes;
    inputFiles.push(await spool(run, randomUUID(), "concat.mp4", value));
  }
  if (plan && inputFiles.length !== plan.scenes.length) throw new FinalVideoError("FINAL_COMPOSITION_SCENE_COUNT");
  if (plan?.scenes.some(scene => scene.transition.type !== "cut")) return composeTransitions(run, inputFiles, plan, ratio, hasAudio);
  const list = await spool(run, randomUUID(), "list.txt", Buffer.from(inputFiles.map(file => `file '${file.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n")));
  const output = await recoveryFile(run, randomUUID(), "final.mp4");
  await runMediaCommand("ffmpeg", [...common, "-f", "concat", "-safe", "0", "-i", list, "-map", "0:v:0",
    ...(hasAudio ? ["-map", "0:a:0", "-c:a", "aac", "-ar", "48000", "-ac", "1", "-af", `asetpts=PTS-STARTPTS,atrim=duration=${durationMs / 1000}`] : ["-an"]),
    "-vf", "setpts=PTS-STARTPTS", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "1",
    "-t", String(durationMs / 1000), "-map_metadata", "-1", "-movflags", "+faststart", output]);
  const metadata = await measure(output, "video/mp4"); validateVideo(metadata, durationMs, ratio, hasAudio);
  return { bytes: await fs.readFile(output), metadata };
}

async function composeTransitions(run: FinalExecution, files: string[], plan: CompositionPlan, ratio: string, hasAudio: boolean) {
  const filters: string[] = [];
  for (const [i, scene] of plan.scenes.entries()) {
    const fade = scene.transition.type === "fade_in" || scene.transition.type === "fade_out" ?
      `,fade=t=${scene.transition.type === "fade_in" ? "in" : "out"}:st=${scene.transition.type === "fade_in" ? 0 : (scene.durationMs - scene.transition.durationMs) / 1000}:d=${scene.transition.durationMs / 1000}` : "";
    filters.push(`[${i}:v]fps=25,format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS${fade}[v${i}]`);
    // Dedicated speech stays at approved absolute offsets with unchanged gain.
    // Visual fades/crossfades never crossfade, truncate or retime that speech.
    if (hasAudio) filters.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,asetpts=PTS-STARTPTS,adelay=${scene.startMs}:all=1,apad,atrim=duration=${plan.totalDurationMs / 1000}[a${i}]`);
  }
  let picture = "v0";
  for (let i = 1; i < files.length; i++) {
    const previous = plan.scenes[i - 1], output = `joined${i}`;
    const combine = previous.transition.type === "crossfade" ?
      `xfade=transition=fade:duration=${previous.transition.durationMs / 1000}:offset=${plan.scenes[i].startMs / 1000}` : "concat=n=2:v=1:a=0";
    filters.push(`[${picture}][v${i}]${combine},fps=25,settb=AVTB[${output}]`); picture = output;
  }
  if (hasAudio) filters.push(`${files.map((_, i) => `[a${i}]`).join("")}amix=inputs=${files.length}:normalize=0:duration=longest[aout]`);
  const output = await recoveryFile(run, randomUUID(), "final.mp4");
  await runMediaCommand("ffmpeg", [...common, ...files.flatMap(file => ["-i", file]), "-filter_complex", filters.join(";"),
    "-map", `[${picture}]`, ...(hasAudio ? ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "1"] : ["-an"]),
    "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "1", "-t", String(plan.totalDurationMs / 1000),
    "-map_metadata", "-1", "-movflags", "+faststart", "-fs", "268435456", output]);
  const metadata = await measure(output, "video/mp4"); validateVideo(metadata, plan.totalDurationMs, ratio, hasAudio);
  return { bytes: await fs.readFile(output), metadata };
}
