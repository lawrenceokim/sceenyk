import "server-only";
import { z } from "zod";
import { VisualError } from "./contract";

// Reviewed against official Runway documentation, 2026-10-11. No router or
// automatic model fallback: a new model needs an explicit capability/rate entry.
export const runwayModels = {
  "gen4.5": { creditsPerSecond: 12, minimumSeconds: 2, maximumSeconds: 10 },
  gen4_turbo: { creditsPerSecond: 5, minimumSeconds: 5, maximumSeconds: 10 },
  aleph2: { creditsPerSecond: 28, minimumSeconds: 2, maximumSeconds: 30 },
} as const;
export function getVisualConfiguration() {
  if (!process.env.RUNWAYML_API_SECRET?.trim()) throw new VisualError("CONFIGURATION_MISSING");
  return {
    apiKey: process.env.RUNWAYML_API_SECRET.trim(),
    textModel: z.literal("gen4.5").parse(process.env.RUNWAY_TEXT_MODEL ?? "gen4.5"),
    imageModel: z.enum(["gen4_turbo", "gen4.5"]).parse(process.env.RUNWAY_IMAGE_MODEL ?? "gen4_turbo"),
    videoModel: z.literal("aleph2").parse(process.env.RUNWAY_VIDEO_MODEL ?? "aleph2"),
    // Infrastructure safeguards only, applied in every environment. Never a
    // customer tariff. Overrides are bounded and remain server-owned.
    maximumSceneSeconds: z.coerce.number().min(2).max(10).parse(process.env.RUNWAY_MAX_SCENE_SECONDS ?? 5),
    maximumSceneUsd: z.coerce.number().positive().max(10).parse(process.env.RUNWAY_MAX_SCENE_USD ?? 1.5),
    maximumJobUsd: z.coerce.number().positive().max(20).parse(process.env.RUNWAY_MAX_JOB_USD ?? 3),
    maximumInputBytes: 20 * 1024 ** 2,
    maximumOutputBytes: 100 * 1024 ** 2,
    pollLimit: 120,
  };
}
