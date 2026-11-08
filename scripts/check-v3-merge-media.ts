// Real local FFmpeg/ffprobe fixtures only. No storage, workers or provider requests.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { runMediaCommand } from "../lib/media-preparation/ffmpeg";
import { mergeLocalFiles, probeMergeFile } from "../lib/final-video-generation-v3/merge-media";

async function main() {
let checks = 0;
const ok = (value: unknown) => { assert.ok(value); checks++; };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const root = await fs.mkdtemp(path.join(os.tmpdir(), "sceenyk-merge-test-"));
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
const digest = async (file: string) => createHash("sha256").update(await fs.readFile(file)).digest("hex");
async function video(name: string, color: string, fps = 25, rate = 48000, channels = 1, size = "480x480", duration = 1, frequency = 440) {
  const file = path.join(root, `${name}.mp4`);
  await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", `color=c=${color}:s=${size}:r=${fps}:d=${duration}`,
    "-f", "lavfi", "-i", `sine=frequency=${frequency}:sample_rate=${rate}:duration=${duration}`, "-map", "0:v", "-map", "1:a", "-c:v", "libx264", "-preset", "fast",
    "-crf", "18", "-pix_fmt", "yuv420p", "-threads", "1", "-c:a", "aac", "-ar", String(rate), "-ac", String(channels), "-movflags", "+faststart", file]);
  return file;
}
async function frameHashes(file: string) {
  const data = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-threads", "1", "-i", file, "-map", "0:v:0", "-f", "framemd5", "-"]);
  return data.split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => line.split(",").at(-1)!.trim());
}
async function audioContinuity(file: string) {
  const data = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-i", file, "-vn", "-af",
    "asetnsamples=n=2400:p=0,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"]);
  const windows = [...data.matchAll(/RMS_level=([^\r\n]+)/g)].map(m => Number(m[1]));
  ok(windows.length > 10); ok(windows.slice(1, -1).every(n => Number.isFinite(n) && n > -40));
}
async function timeline(file: string, maxGap: number) {
  const result = JSON.parse(await runMediaCommand("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_frames", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", file]));
  const pts = result.frames.map((f: { best_effort_timestamp_time: string }) => Number(f.best_effort_timestamp_time)) as number[];
  ok(pts.length > 20);
  for (let i = 1; i < pts.length; i++) ok(pts[i] > pts[i - 1] && pts[i] - pts[i - 1] <= maxGap);
}
try {
  const colors = ["red", "blue", "green", "yellow", "cyan", "magenta", "orange", "white", "purple"];
  const files: string[] = [];
  for (const [i, color] of colors.entries()) files.push(await video(`clip-${i}`, color, 25, 48000, 1, "480x480", 1, 220 + i * 110));
  const originals = await Promise.all(files.map(digest)), hashes = await Promise.all(files.map(frameHashes));
  for (const count of [2, 4, 7, 9]) {
    const output = path.join(root, `merge-${count}.mp4`);
    const result = await mergeLocalFiles(files.slice(0, count).map(file => ({ file, durationMs: 1000 })), output, path.join(root, `list-${count}.txt`),
      { resolution: "480p", aspectRatio: "1:1", durationMs: count * 1000 }, AbortSignal.timeout(120000));
    equal(result.mode, "copy-video"); equal(result.metadata.width, 480); equal(result.metadata.height, 480);
    ok(Math.abs(result.metadata.durationMs - count * 1000) <= 25);
    // Exact decoded frames establish order, no added black/repeated/missing frames, and lossless video copy.
    equal(await frameHashes(output), hashes.slice(0, count).flat());
    await timeline(output, .041); await audioContinuity(output);
    for (let i = 0; i < count; i++) {
      const audio = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(i + .25), "-i", output, "-t", "0.25", "-vn", "-af",
        "astats=metadata=1:reset=0,ametadata=print:key=lavfi.astats.1.Zero_crossings_rate:file=-", "-f", "null", "-"]);
      const rates = [...audio.matchAll(/Zero_crossings_rate=([^\r\n]+)/g)];
      ok(rates.length > 0); ok(Math.abs(Number(rates.at(-1)![1]) * 48000 / 2 - (220 + i * 110)) < 20);
    }
  }
  const mixed = [files[0], await video("mixed-rate", "blue", 30, 44100, 2)];
  const mixedOutput = path.join(root, "mixed.mp4");
  const normalized = await mergeLocalFiles(mixed.map(file => ({ file, durationMs: 1000 })), mixedOutput, path.join(root, "mixed.txt"),
    { resolution: "480p", aspectRatio: "1:1", durationMs: 2000 }, AbortSignal.timeout(120000));
  equal(normalized.mode, "normalized-video"); equal(normalized.metadata.hasAudio, true);
  equal((await probeMergeFile(mixedOutput)).audio.channels, 2); equal((await probeMergeFile(mixedOutput)).audio.sample_rate, "48000");
  ok(Math.abs(normalized.metadata.durationMs - 2000) <= 50); await timeline(mixedOutput, .041); await audioContinuity(mixedOutput);
  // Preserve output geometry; no application setting or provider call is needed.
  for (const [resolution, size, ratio] of [["480p", "480x854", "9:16"], ["720p", "1280x720", "16:9"], ["1080p", "1080x1080", "1:1"]] as const) {
    const a = await video(`geometry-${resolution}-a`, "red", 25, 48000, 2, size), b = await video(`geometry-${resolution}-b`, "blue", 25, 48000, 2, size);
    const result = await mergeLocalFiles([{ file: a, durationMs: 1000 }, { file: b, durationMs: 1000 }], path.join(root, `geometry-${resolution}.mp4`), path.join(root, `geometry-${resolution}.txt`),
      { resolution, aspectRatio: ratio, durationMs: 2000 }, AbortSignal.timeout(120000));
    equal(Math.min(result.metadata.width, result.metadata.height), Number.parseInt(resolution)); equal(result.mode, "copy-video");
  }
  const odd = await video("length-variation", "red", 25, 48000, 1, "480x480", 1.12);
  const variance = await mergeLocalFiles([{ file: odd, durationMs: 1000 }, { file: files[0], durationMs: 1000 }], path.join(root, "variance.mp4"), path.join(root, "variance.txt"),
    { resolution: "480p", aspectRatio: "1:1", durationMs: 2000 }, AbortSignal.timeout(120000));
  equal(variance.inputDurationMs, 2120); ok(Math.abs(variance.metadata.durationMs - 2120) <= 25);
  const corrupt = path.join(root, "corrupt.mp4"); await fs.writeFile(corrupt, "invalid video");
  await assert.rejects(() => mergeLocalFiles([{ file: corrupt, durationMs: 1000 }, { file: files[0], durationMs: 1000 }], path.join(root, "invalid.mp4"), path.join(root, "invalid.txt"),
    { resolution: "480p", aspectRatio: "1:1", durationMs: 2000 }, AbortSignal.timeout(120000))); checks++;
  const noAudio = path.join(root, "silent.mp4");
  await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-i", files[0], "-c:v", "copy", "-an", noAudio]);
  await assert.rejects(() => probeMergeFile(noAudio), /V3_MERGE_SOURCE_INVALID/); checks++;
  equal(await Promise.all(files.map(digest)), originals);
  console.info(JSON.stringify({ localMergeChecks: checks, approvedClipCounts: [2, 4, 7, 9], realProviderRequests: 0 }));
} finally { globalThis.fetch = previousFetch; await fs.rm(root, { recursive: true, force: true }); }

}
main().catch(error => { console.error(error); process.exitCode = 1; });
