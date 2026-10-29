import "server-only";
import { promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { runMediaCommand } from "@/lib/media-preparation/ffmpeg";
import type { CharacterTiming, SpeechAlignment, SpeechFitProof, SpeechFitFailure } from "@/lib/speech-timing/plan";
import { FinalVideoError } from "./contract";
import { measure } from "./media";

// Explicit conservative engineering policy, not a perceptual quality guarantee.
// Callers may tighten it; greater acceleration needs a reviewed TTS replacement.
export const localSpeechFitPolicy = { maxTempoPermille: 1080, headroomMs: 25, sampleRate: 48000 } as const;
export class SpeechFitLimitError extends FinalVideoError {
  constructor(readonly details: SpeechFitFailure) { super("FINAL_SPEECH_RETRY_REQUIRED"); }
}
export function validateCharacterTiming(value: CharacterTiming | null, durationMs: number, text?: string) {
  if (!value) return;
  if (!Array.isArray(value.characters) || value.characters.some(c => typeof c !== "string") ||
    text !== undefined && value.characters.join("") !== text || !Array.isArray(value.startsMs) || !Array.isArray(value.endsMs) ||
    value.characters.length !== value.startsMs.length || value.characters.length !== value.endsMs.length)
    throw new FinalVideoError("FINAL_VOICE_ALIGNMENT_INVALID");
  let start = 0, end = 0;
  for (let i = 0; i < value.characters.length; i++) {
    const a = value.startsMs[i], b = value.endsMs[i];
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < start || b < a || b < end || b > durationMs + 50)
      throw new FinalVideoError("FINAL_VOICE_ALIGNMENT_INVALID");
    start = a; end = b;
  }
}
export function localTempo(decodedDurationMs: number, windowMs: number, maxTempoPermille: number = localSpeechFitPolicy.maxTempoPermille) {
  if (!Number.isSafeInteger(decodedDurationMs) || decodedDurationMs <= 0 || !Number.isSafeInteger(windowMs) || windowMs <= 0 ||
    !Number.isSafeInteger(maxTempoPermille) || maxTempoPermille < 1000 || maxTempoPermille > localSpeechFitPolicy.maxTempoPermille)
    throw new FinalVideoError("FINAL_SPEECH_FIT_POLICY_INVALID");
  const tempo = decodedDurationMs <= windowMs ? 1000 : Math.ceil(decodedDurationMs * 1000 / Math.max(1, windowMs - localSpeechFitPolicy.headroomMs));
  if (tempo > maxTempoPermille) throw new FinalVideoError("FINAL_SPEECH_RETRY_REQUIRED");
  return tempo;
}
export async function fitSpeechFile(source: string, output: string, text: string, windowMs: number,
  alignment: SpeechAlignment = { original: null, normalized: null }, maxTempoPermille?: number) {
  const container = await measure(source, "audio/mpeg"), decoded = `${output}.decoded.wav`;
  const sourceSha256 = createHash("sha256").update(await fs.readFile(source)).digest("hex");
  const common = ["-v", "error", "-nostdin", "-y", "-threads", "1", "-filter_threads", "1", "-protocol_whitelist", "file,pipe"];
  try {
    // Decode every sample. WAV has no MP3 encoder delay/padding, and no -t,
    // atrim or silence-removal filter can cut words or quiet phonemes here.
    await runMediaCommand("ffmpeg", [...common, "-i", source, "-map", "0:a:0", "-vn", "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", decoded]);
    const raw = await measure(decoded, "audio/wav");
    validateCharacterTiming(alignment.original, raw.durationMs, text);
    validateCharacterTiming(alignment.normalized, raw.durationMs);
    const details: SpeechFitFailure = { version: "local-speech-fit-v1", sourceContainerDurationMs: container.durationMs, decodedDurationMs: raw.durationMs,
      windowMs, requiredTempoPermille: raw.durationMs <= windowMs ? 1000 : Math.ceil(raw.durationMs * 1000 / Math.max(1, windowMs - localSpeechFitPolicy.headroomMs)),
      maximumTempoPermille: maxTempoPermille ?? localSpeechFitPolicy.maxTempoPermille };
    let tempoPermille;
    try { tempoPermille = localTempo(raw.durationMs, windowMs, maxTempoPermille); }
    catch (error) { if (error instanceof FinalVideoError && error.code === "FINAL_SPEECH_RETRY_REQUIRED") throw new SpeechFitLimitError(details); throw error; }
    await runMediaCommand("ffmpeg", [...common, "-i", decoded, "-map", "0:a:0", "-af", `atempo=${tempoPermille / 1000}`,
      "-ar", "48000", "-ac", "1", "-c:a", "pcm_s16le", "-map_metadata", "-1", output]);
    const metadata = await measure(output, "audio/wav");
    if (metadata.durationMs > windowMs) throw new SpeechFitLimitError({ ...details, measuredOutputDurationMs: metadata.durationMs });
    const transform = (value: CharacterTiming | null): CharacterTiming | null => value ? { characters: [...value.characters],
      startsMs: value.startsMs.map(ms => Math.round(ms * 1000 / tempoPermille)), endsMs: value.endsMs.map(ms => Math.round(ms * 1000 / tempoPermille)) } : null;
    const fittedAlignment = { original: transform(alignment.original), normalized: transform(alignment.normalized) };
    validateCharacterTiming(fittedAlignment.original, metadata.durationMs, text);
    validateCharacterTiming(fittedAlignment.normalized, metadata.durationMs);
    const proof: SpeechFitProof = { version: "local-speech-fit-v1", policyMaxTempoPermille: maxTempoPermille ?? localSpeechFitPolicy.maxTempoPermille,
      timingMap: "linear-tempo-approximation",
      sourceSha256, sourceContainerDurationMs: container.durationMs, decodedDurationMs: raw.durationMs,
      outputDurationMs: metadata.durationMs, windowMs, tempoPermille, trimStartMs: 0, trimEndMs: 0,
      originalAlignment: alignment, fittedAlignment };
    return { bytes: await fs.readFile(output), metadata, proof };
  } finally { await fs.unlink(decoded).catch(() => {}); }
}
