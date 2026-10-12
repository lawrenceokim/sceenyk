import { z } from "zod";

export const renderStatuses = ["pending", "dispatched", "rendering", "uploading", "verifying", "completed", "failed"] as const;
export type RenderStatus = typeof renderStatuses[number];
export const renderConfiguration = {
  version: "final-mp4-v1", fps: 24, codec: "h264", audioCodec: "aac",
  pixelFormat: "yuv420p", colorSpace: "bt709", crf: 23, concurrency: 1, outputToleranceMs: 85,
  audioSampleRate: 48_000, audioBitrate: "128k",
  x264Preset: "ultrafast", mediaCacheBytes: 16 * 1024 ** 2,
  maximumInputBytes: 104_857_600, maximumOutputBytes: 52_428_800,
  maximumAttempts: 3, processTimeoutMs: 1_200_000,
} as const;
export function renderShape(aspect: "16:9" | "9:16" | "1:1") {
  return aspect === "16:9" ? { width: 640, height: 360 } : aspect === "9:16" ? { width: 360, height: 640 } : { width: 480, height: 480 };
}
export const renderRequestSchema = z.strictObject({ renderJobId: z.uuid() });
export const outputMetadataSchema = z.strictObject({
  sizeBytes: z.number().int().positive().max(renderConfiguration.maximumOutputBytes),
  etag: z.string().min(1).max(200), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  durationMs: z.number().int().positive().max(600_000),
  width: z.number().int().positive(), height: z.number().int().positive(),
  fps: z.literal(24), videoCodec: z.literal("h264"), audioCodec: z.literal("aac"),
  renderDurationMs: z.number().int().nonnegative(), observedRssBytes: z.number().int().nonnegative(),
});
export const renderErrorCodes = ["SOURCE_UNAVAILABLE", "RENDER_FAILED", "RENDER_TIMEOUT", "RESOURCE_LIMIT", "INVALID_OUTPUT", "DURATION_MISMATCH", "RENDER_UNAVAILABLE"] as const;
export type RenderErrorCode = typeof renderErrorCodes[number];
export class RenderError extends Error {
  constructor(public code: RenderErrorCode, public temporary = false) { super(code); }
}
export type RenderJob = {
  id: string; generation_job_id: string; owner_user_id: string; project_id: string;
  composition_plan_id: string; composition_digest: string; render_version: "final-mp4-v1";
  status: RenderStatus; worker_attempts: number; lease_id: string | null; lease_expires_at: string | null;
  output_asset_id: string | null; error_code: RenderErrorCode | null;
  started_at: string | null; completed_at: string | null; failed_at: string | null;
  created_at: string; updated_at: string;
};
export type FinalVideoAsset = {
  id: string; render_job_id: string; generation_job_id: string; owner_user_id: string; project_id: string;
  storage_key: string; mime_type: "video/mp4"; size_bytes: number; verified_etag: string;
  sha256: string; duration_ms: number; width: number; height: number; fps: number;
  video_codec: "h264"; audio_codec: "aac"; render_duration_ms: number; observed_rss_bytes: number; verified_at: string;
};
