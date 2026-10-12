import "server-only";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileTypeFromBuffer } from "file-type";
import { z } from "zod";
import { inspectR2Object, readR2AnalysisMedia, putR2NarrationOutput } from "@/lib/storage/r2";
import { runMediaCommand } from "@/lib/media-preparation/ffmpeg";
import { voiceLimits } from "./config";
import { VoiceError, type NarrationSegment } from "./contract";

export function narrationOutputKey(segment: NarrationSegment) {
  return `users/${segment.owner_user_id}/projects/${segment.project_id}/generations/${segment.job_id}/narration/${segment.id}.mp3`;
}
export async function probeNarration(bytes: Uint8Array) {
  const directory = await mkdtemp(join(tmpdir(), "sceenyk-narration-"));
  try {
    const file = join(directory, "audio.mp3");
    await writeFile(file, bytes, { flag: "wx" });
    const result = z.object({ streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional(), sample_rate: z.string().optional(), channels: z.number().optional() })), format: z.object({ duration: z.string() }) }).parse(JSON.parse(await runMediaCommand("ffprobe", ["-v", "error", "-protocol_whitelist", "file,pipe", "-show_streams", "-show_format", "-of", "json", file])));
    const audio = result.streams.find(s => s.codec_type === "audio"), durationMs = Math.round(Number(result.format.duration) * 1000);
    if (result.streams.length !== 1 || audio?.codec_name !== "mp3" || audio.sample_rate !== "44100" || !audio.channels || ![1, 2].includes(audio.channels) || !Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > voiceLimits.maximumDurationMs) throw new VoiceError("INVALID_AUDIO");
    return { durationMs, sampleRate: Number(audio.sample_rate), channels: audio.channels };
  } catch (error) {
    if (error instanceof VoiceError) throw error;
    throw new VoiceError("DURATION_PROBE_FAILED", true);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
// Stable private object recovery precedes every paid submission decision.
export async function recoverNarration(segment: NarrationSegment) {
  const key = narrationOutputKey(segment), stored = await inspectR2Object(key);
  if (!stored) return null;
  if (!stored.etag || !stored.sizeBytes || stored.sizeBytes > voiceLimits.outputBytes || stored.mimeType !== "audio/mpeg" || (await fileTypeFromBuffer(stored.header))?.mime !== "audio/mpeg") throw new VoiceError("INVALID_STORED_AUDIO");
  const stream = await readR2AnalysisMedia(key, stored.etag, stored.sizeBytes, AbortSignal.timeout(30_000));
  const reader = stream.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > voiceLimits.outputBytes) throw new VoiceError("INVALID_STORED_AUDIO");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  if (size !== stored.sizeBytes) throw new VoiceError("INVALID_STORED_AUDIO");
  return { sizeBytes: size, etag: stored.etag, ...await probeNarration(Buffer.concat(chunks, size)) };
}
export async function persistNarration(segment: NarrationSegment, bytes: Uint8Array) {
  // Upload before probing so a probe/DB interruption can recover without spending.
  await putR2NarrationOutput(narrationOutputKey(segment), bytes);
  const saved = await recoverNarration(segment);
  if (!saved) throw new VoiceError("OUTPUT_STORAGE_FAILED", true);
  return saved;
}
