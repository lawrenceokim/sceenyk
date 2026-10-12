import "server-only";
import { createFalClient, ApiError } from "@fal-ai/client";
import { z } from "zod";
import { falEndpoints, getVisualConfiguration } from "../config";
import { VisualError, type SceneExecution } from "../contract";

// SDK 1.10.1 queue methods override config.retry. Normalize HTTP/transport
// failures before its retry classifier sees them, keeping retries durable.
class TransportError extends Error {
  constructor(readonly status?: number) { super("FAL_TRANSPORT_FAILED"); }
}
function client() {
  let sent = false;
  return createFalClient({ credentials: getVisualConfiguration().apiKey, retry: { maxRetries: 0 }, fetch: async (input, init) => {
    // Also block replay after a successful HTTP response whose body is lost.
    // Each queue operation receives a fresh client/one-request transport.
    if (sent) throw new TransportError();
    sent = true;
    let response;
    try { response = await fetch(input, { ...init, cache: "no-store", signal: init?.signal ?? AbortSignal.timeout(30_000) }); }
    catch { throw new TransportError(); }
    if (!response.ok) { await response.body?.cancel(); throw new TransportError(response.status); }
    return response;
  } });
}
function providerError(error: unknown, submitting = false): never {
  const status = error instanceof ApiError || error instanceof TransportError ? error.status : undefined;
  if (status === 429) throw new VisualError("RATE_LIMIT", true);
  if (status && status >= 400 && status < 500) throw new VisualError("PROVIDER_REJECTED");
  throw new VisualError(submitting ? "UNCERTAIN_SUBMISSION" : "PROVIDER_UNAVAILABLE", !submitting);
}
const requestId = z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/);
function endpoint(scene: SceneExecution) {
  if (scene.provider !== "fal") throw new VisualError("PROVIDER_INACTIVE");
  return z.enum([falEndpoints.text, falEndpoints.image, falEndpoints.video]).parse(scene.model);
}
async function submit(scene: SceneExecution, input: Record<string, unknown>) {
  try {
    const task = await client().queue.submit(endpoint(scene), { input, startTimeout: getVisualConfiguration().queueStartTimeout });
    return { taskId: requestId.parse(task.request_id), estimatedCredits: null };
  } catch (error) { if (error instanceof VisualError) throw error; return providerError(error, true); }
}
export async function generateScene(scene: SceneExecution, inputUrl?: string) {
  const duration = z.union([z.literal(6), z.literal(8), z.literal(10)]).parse(scene.duration_seconds);
  const input: Record<string, unknown> = { prompt: scene.prompt, duration, resolution: z.literal("720p").parse(scene.resolution), fps: 25, aspect_ratio: z.enum(["16:9", "9:16"]).parse(scene.pricing_snapshot.aspectRatio), generate_audio: false };
  if (scene.operation === "image_to_video") {
    if (!inputUrl) throw new VisualError("MEDIA_UNAVAILABLE");
    input.image_url = inputUrl;
  }
  return submit(scene, input);
}
export async function transformScene(scene: SceneExecution, inputUrl: string) {
  return submit(scene, { prompt: `${scene.prompt} Preserve source movement, action timing, camera direction, subject identity and scene intent while applying the visual change. Preserve text and HUD unless explicitly instructed otherwise.`, video_url: inputUrl, num_frames: z.number().int().min(9).max(121).parse(scene.pricing_snapshot.numFrames), frames_per_second: 24, resolution: "auto", generate_audio: false, video_strength: .8, enable_prompt_expansion: false, enable_safety_checker: true, negative_prompt: "blurry, distorted motion, unintended text changes" });
}
export async function getTaskStatus(scene: SceneExecution) {
  const model = endpoint(scene), id = requestId.parse(scene.provider_task_id);
  try {
    const task = await client().queue.status(model, { requestId: id, logs: false });
    if (!["IN_QUEUE", "IN_PROGRESS", "COMPLETED"].includes(task.status)) throw new VisualError("INVALID_OUTPUT", true);
    if (task.status !== "COMPLETED") return { status: "RUNNING", credits: null, outputUrl: null, usage: null };
    try {
      const result = await client().queue.result(model, { requestId: id });
      const video = z.object({ url: z.url(), width: z.number().positive().optional(), height: z.number().positive().optional(), duration: z.number().positive().optional(), fps: z.number().positive().optional(), num_frames: z.number().positive().optional() }).parse((result.data as { video?: unknown }).video);
      return { status: "SUCCEEDED", credits: null, outputUrl: video.url, usage: { outputDuration: video.duration ?? null, width: video.width ?? null, height: video.height ?? null, fps: video.fps ?? null, numFrames: video.num_frames ?? null, nativeAudio: false } };
    } catch (error) {
      if ((error instanceof ApiError || error instanceof TransportError) && error.status && [400, 422].includes(error.status)) return { status: "FAILED", credits: null, outputUrl: null, usage: null };
      if (error instanceof z.ZodError) throw new VisualError("INVALID_OUTPUT", true);
      throw error;
    }
  } catch (error) { if (error instanceof VisualError) throw error; return providerError(error); }
}
