// Provider-neutral V1 timing policy. Estimates are planning safeguards, never a
// guarantee of a particular voice's generated duration. Hard creative budgets
// remain independently enforced by Storyboard validation.
export type SpeechPace = "slow" | "natural" | "energetic";
export const speechTimingLimits = { minSpeedPermille: 700, maxSpeedPermille: 1200 } as const;
export type SpeechTimingTarget = { version: "speech-window-v1"; windowMs: number; safetyMs: number;
  naturalEstimateMs: number; estimatedDurationMs: number; targetSpeedPermille: number; feasible: boolean };
export function planSpeechTiming(text: string, startMs: number, endMs: number, pace: SpeechPace,
  limits: { minSpeedPermille: number; maxSpeedPermille: number } = speechTimingLimits): SpeechTimingTarget {
  const windowMs = endMs - startMs;
  if (!Number.isSafeInteger(startMs) || startMs < 0 || !Number.isSafeInteger(endMs) || windowMs <= 0 ||
    !["slow", "natural", "energetic"].includes(pace) || !text.trim() ||
    !Number.isSafeInteger(limits.minSpeedPermille) || !Number.isSafeInteger(limits.maxSpeedPermille) ||
    limits.minSpeedPermille <= 0 || limits.maxSpeedPermille < limits.minSpeedPermille) throw new Error("SPEECH_TIMING_INPUT_INVALID");
  const words = text.trim().split(/\s+/u).length, characters = [...text.replace(/\s/gu, "")].length;
  const naturalEstimateMs = Math.ceil(Math.max(words * 1000 / 2.3, characters * 1000 / 16));
  const safetyMs = Math.min(200, Math.max(1, Math.ceil(windowMs * 0.1)));
  const availableMs = Math.max(1, windowMs - safetyMs);
  const paceSpeed = { slow: 900, natural: 1000, energetic: 1100 }[pace];
  // Round upwards to hundredths, never silently clamp an infeasible estimate.
  const targetSpeedPermille = Math.max(limits.minSpeedPermille, paceSpeed, Math.ceil(naturalEstimateMs / availableMs * 100) * 10);
  return { version: "speech-window-v1", windowMs, safetyMs, naturalEstimateMs, targetSpeedPermille,
    estimatedDurationMs: Math.ceil(naturalEstimateMs * 1000 / targetSpeedPermille), feasible: targetSpeedPermille <= limits.maxSpeedPermille };
}

export type CharacterTiming = { characters: string[]; startsMs: number[]; endsMs: number[] };
export type SpeechAlignment = { original: CharacterTiming | null; normalized: CharacterTiming | null };
export type SpeechFitProof = { version: "local-speech-fit-v1"; policyMaxTempoPermille: number; sourceSha256: string;
  timingMap: "linear-tempo-approximation";
  sourceContainerDurationMs: number; decodedDurationMs: number; outputDurationMs: number; windowMs: number;
  tempoPermille: number; trimStartMs: number; trimEndMs: number; originalAlignment: SpeechAlignment;
  fittedAlignment: SpeechAlignment };
export type SpeechFitFailure = { version: "local-speech-fit-v1"; sourceContainerDurationMs: number; decodedDurationMs: number;
  windowMs: number; requiredTempoPermille: number; maximumTempoPermille: number; measuredOutputDurationMs?: number };
