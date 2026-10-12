import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { PreparationError } from "./contract";

// Visual-only derivatives. Original audio/overlays remain in the immutable source.
export function normalization(aspectRatio: "16:9" | "9:16" | "1:1") {
  return { version: "visual-segment-v1", codec: "h264", pixelFormat: "yuv420p", fps: 24, audio: false, aspectRatio, fit: "contain-no-upscale", maximumDimension: 1280, crf: 18 } as const;
}
export function normalizationKey(settings: ReturnType<typeof normalization>) { return createHash("sha256").update(JSON.stringify(settings)).digest("hex"); }
export const preparationLimits = { sourceBytes: 100 * 1024 ** 2, outputBytes: 20 * 1024 ** 2, segmentMs: 30_000, sourceMs: 600_000, processMs: 90_000, requestMs: 240_000, durationToleranceMs: 43 } as const;
export function workerConnection() {
  const token = process.env.MEDIA_PREPARATION_WORKER_TOKEN?.trim();
  const parsed = z.url().safeParse(process.env.MEDIA_PREPARATION_WORKER_URL);
  if (!token || token.length < 32 || !parsed.success) throw new PreparationError("PREPARATION_UNAVAILABLE", true);
  const url = new URL(parsed.data);
  if (url.username || url.password || url.search || url.hash || !(url.protocol === "https:" || url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) throw new PreparationError("PREPARATION_UNAVAILABLE", true);
  return { url: new URL("/prepare", url).toString(), token };
}
