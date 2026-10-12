import "server-only";
import { z } from "zod";
import { VisualError } from "./contract";

// Official schemas/prices reviewed 2026-10-12. No automatic model fallback.
export const falEndpoints = {
  text: "lightricks/ltx-2.5/text-to-video/fast",
  image: "lightricks/ltx-2.5/image-to-video/fast",
  video: "fal-ai/ltx-2.3-quality/reference-video-to-video",
} as const;
export function getVisualConfiguration() {
  if (!process.env.FAL_KEY?.trim()) throw new VisualError("CONFIGURATION_MISSING");
  return {
    provider: "fal" as const, apiKey: process.env.FAL_KEY.trim(),
    textModel: z.literal(falEndpoints.text).parse(process.env.FAL_TEXT_MODEL ?? falEndpoints.text),
    imageModel: z.literal(falEndpoints.image).parse(process.env.FAL_IMAGE_MODEL ?? falEndpoints.image),
    videoModel: z.literal(falEndpoints.video).parse(process.env.FAL_VIDEO_MODEL ?? falEndpoints.video),
    pricingVersion: process.env.FAL_PRICING_VERSION?.trim() || "fal-reviewed-2026-10-12",
    videoSecondUsd: z.coerce.number().positive().max(1).parse(process.env.FAL_VIDEO_SECOND_USD ?? 0.09),
    transformMegapixelUsd: z.coerce.number().positive().max(1).parse(process.env.FAL_TRANSFORM_MEGAPIXEL_USD ?? 0.0024075),
    maximumSceneSeconds: z.coerce.number().min(6).max(10).parse(process.env.FAL_MAX_SCENE_SECONDS ?? 6),
    maximumSceneUsd: z.coerce.number().positive().max(10).parse(process.env.FAL_MAX_SCENE_USD ?? 1.5),
    maximumJobUsd: z.coerce.number().positive().max(20).parse(process.env.FAL_MAX_JOB_USD ?? 3),
    maximumInputBytes: 20 * 1024 ** 2, maximumOutputBytes: 100 * 1024 ** 2,
    queueStartTimeout: 180, pollLimit: 120,
  };
}
