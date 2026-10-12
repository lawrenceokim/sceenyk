import { PreparationError } from "./contract";

export function milliseconds(seconds: unknown): number {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0 || !Number.isSafeInteger(Math.round(seconds * 1000))) throw new PreparationError("INVALID_SOURCE_TIMING");
  return Math.round(seconds * 1000);
}
export function sourceTiming(start: unknown, end: unknown, duration: unknown) {
  return segmentTiming(milliseconds(start), milliseconds(end), milliseconds(duration));
}
export function segmentTiming(startMs: unknown, endMs: unknown, durationMs: unknown) {
  if (typeof startMs !== "number" || typeof endMs !== "number" || typeof durationMs !== "number" || ![startMs, endMs, durationMs].every(Number.isSafeInteger) || startMs < 0) throw new PreparationError("INVALID_SOURCE_TIMING");
  if (endMs <= startMs || durationMs <= 0 || Math.abs(endMs - startMs - durationMs) > 1) throw new PreparationError("INVALID_SOURCE_TIMING");
  return { startMs, endMs, durationMs };
}
export function validateSourceDuration(endMs: number, actualDurationMs: number) {
  if (!Number.isSafeInteger(actualDurationMs) || actualDurationMs <= 0) throw new PreparationError("SOURCE_DURATION_UNAVAILABLE");
  if (endMs > actualDurationMs + 1) throw new PreparationError("SOURCE_RANGE_EXCEEDED");
}
