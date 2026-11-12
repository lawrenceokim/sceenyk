import { proDurations } from "./options";

export const isProDuration = (value: string) => proDurations.some(d => d.value === value);
export const requiresProDuration = (value: string) => isProDuration(value) && value !== "10" && value !== "30";
export const MULTI_CLIP_PLANNING_ONLY = "V3_MULTI_CLIP_PLANNING_ONLY";
export function assertSingleVideoExecution(durationMs: number) {
  if (durationMs > 30_000) throw new Error(MULTI_CLIP_PLANNING_ONLY);
}
