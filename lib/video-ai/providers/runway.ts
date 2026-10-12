import "server-only";
import RunwayML, { toFile } from "@runwayml/sdk";
import { z } from "zod";
import { getVisualConfiguration } from "../legacy-runway-config";
import { VisualError, type SceneExecution } from "../contract";

function client() {
  return new RunwayML({ apiKey: getVisualConfiguration().apiKey, maxRetries: 0, timeout: 30_000, fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) });
}
function providerError(error: unknown, submitting = false): never {
  // Never propagate raw SDK errors (they can contain requests/capabilities).
  const status = error instanceof RunwayML.APIError ? error.status : undefined;
  if (status === 429) throw new VisualError("RATE_LIMIT", true);
  if (status && status >= 400 && status < 500) throw new VisualError("PROVIDER_REJECTED");
  throw new VisualError(submitting ? "UNCERTAIN_SUBMISSION" : "PROVIDER_UNAVAILABLE", !submitting);
}
export async function uploadSceneInput(bytes: Uint8Array, mimeType: string) {
  const extension = { "video/mp4": "mp4", "video/webm": "webm", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[mimeType];
  if (!extension || bytes.byteLength > getVisualConfiguration().maximumInputBytes) throw new VisualError("UNSUPPORTED_MEDIA");
  try {
    const file = await toFile(bytes, `scene-input.${extension}`, { type: mimeType });
    const result = await client().uploads.createEphemeral({ file });
    return z.string().startsWith("runway://").parse(result.uri);
  } catch (error) { return providerError(error); }
}
function taskCreated(value: unknown) {
  const result = z.object({ id: z.uuid(), estimatedCost: z.object({ credits: z.number().nonnegative() }).optional() }).parse(value);
  return { taskId: result.id, estimatedCredits: result.estimatedCost?.credits ?? null };
}
export async function generateScene(scene: SceneExecution, inputUri?: string) {
  try {
    const ratio = z.enum(["1280:720", "720:1280", "960:960"]).parse(scene.resolution);
    if (scene.operation === "text_to_video") return taskCreated(await client().textToVideo.create({ model: z.literal("gen4.5").parse(scene.model), promptText: scene.prompt, duration: scene.duration_seconds, ratio: z.enum(["1280:720", "720:1280"]).parse(ratio) }));
    if (!inputUri) throw new VisualError("MEDIA_UNAVAILABLE");
    return taskCreated(await client().imageToVideo.create({ model: z.enum(["gen4_turbo", "gen4.5"]).parse(scene.model), promptText: scene.prompt, promptImage: inputUri, duration: scene.duration_seconds, ratio }));
  } catch (error) { if (error instanceof VisualError) throw error; return providerError(error, true); }
}
export async function transformScene(scene: SceneExecution, inputUri: string) {
  try {
    return taskCreated(await client().videoToVideo.create({ model: z.literal("aleph2").parse(scene.model), videoUri: inputUri, promptText: scene.prompt, outputFormat: "mp4" }));
  } catch (error) { return providerError(error, true); }
}
export async function getTaskStatus(taskId: string) {
  try {
    const result = z.object({
      status: z.enum(["PENDING", "THROTTLED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"]),
      cost: z.object({ credits: z.number().nonnegative() }).optional(),
      output: z.array(z.url()).optional(),
    }).parse(await client().tasks.retrieve(z.uuid().parse(taskId)));
    const credits = result.cost?.credits ?? null;
    return { status: result.status, credits, outputUrl: result.status === "SUCCEEDED" ? result.output?.[0] ?? null : null };
  } catch (error) { return providerError(error); }
}
