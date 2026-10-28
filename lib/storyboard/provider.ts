import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { StoryboardInput } from "./contract";
import { executableStoryboardSchema } from "./schema";
import { providerMetaSchema, safeRequestId, type StoryboardProviderMeta, type StoryboardDiagnostic } from "./recovery-contract";
import { captureStoryboardResponse } from "./response-capture";
import { storyboardProviderDiagnostic, StoryboardProviderFailure } from "./diagnostics";
import type { StoryboardSavedResponse } from "./spool";
import { storyboardPrompt } from "./prompt";
import type { StoryboardCorrection } from "./correction";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";

export function storyboardConfig(frozenModel?: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = frozenModel ?? process.env.OPENAI_STORYBOARD_MODEL?.trim();
  if (process.env.UGC_STORYBOARD_ENABLED !== "1" || !apiKey || !model || !/^[a-zA-Z0-9._:-]{1,200}$/.test(model))
    throw new Error("STORYBOARD_CONFIG_INVALID");
  return { model, apiKey, maxOutputTokens: 14_000, storeResponses: process.env.UGC_STORYBOARD_STORE_RESPONSES === "1" } as const;
}

export type StoryboardCapture = { metadata: StoryboardProviderMeta;
  saveMetadata: (kind: "headers" | "created", metadata: StoryboardProviderMeta) => Promise<void>;
  saveRawResponse: (response: OpenAIResponse) => Promise<void>;
  saveResponse: (response: StoryboardSavedResponse) => Promise<void> };
export async function requestStoryboard(input: StoryboardInput, model: string, images: Buffer[], signal: AbortSignal, capture: StoryboardCapture,
  repair?: StoryboardCorrection) {
  const config = storyboardConfig(model);
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 180_000, logLevel: "off" });
  let metadata = providerMetaSchema.parse(capture.metadata);
  let phase: StoryboardDiagnostic["phase"] = "headers";
  // Strip private R2 descriptors, source IDs and implementation details from text context.
  const prompt = storyboardPrompt(input, repair);
  try {
  const stream = await client.responses.create({ model, store: metadata.stored, stream: true, max_output_tokens: config.maxOutputTokens,
    instructions: prompt.instructions, input: [{ role: "user", content: [
      { type: "input_text", text: JSON.stringify(prompt.context) },
      ...images.flatMap((bytes, index) => [
        { type: "input_text" as const, text: ["Approved Character Sheet", "Approved Product Sheet", "Approved Location image"][index] },
        { type: "input_image" as const, image_url: `data:image/png;base64,${bytes.toString("base64")}`, detail: "high" as const },
      ]),
      ...(prompt.correction ? [{ type: "input_text" as const, text: JSON.stringify(prompt.correction) }] : []),
    ] }], text: { format: zodTextFormat(executableStoryboardSchema, "ugc_storyboard_v2") },
  }, { signal, headers: { "X-Client-Request-Id": metadata.clientRequestId } }).withResponse();
  const requestId = safeRequestId.safeParse(stream.request_id);
  metadata = { ...metadata, requestId: requestId.success ? requestId.data : null, httpStatus: stream.response.status };
  phase = "response_capture"; await capture.saveMetadata("headers", metadata);
  phase = "stream";
  for await (const event of stream.data) {
    if (event.type === "response.created") {
      metadata = providerMetaSchema.parse({ ...metadata, responseId: event.response.id, providerStatus: event.response.status ?? "unknown" });
      phase = "response_capture"; await capture.saveMetadata("created", metadata); phase = "stream";
    } else if (["response.completed", "response.failed", "response.incomplete"].includes(event.type) && "response" in event) {
      phase = "response_capture";
      await capture.saveRawResponse(event.response);
      metadata = providerMetaSchema.parse({ ...metadata, responseId: event.response.id, providerStatus: event.response.status ?? "unknown" });
      phase = "response_capture";
      const saved = captureStoryboardResponse(event.response, metadata);
      // This fsync precedes any heartbeat, DB checkpoint or storyboard parsing.
      await capture.saveResponse(saved);
      return saved;
    } else if (event.type === "error") {
      throw new StoryboardProviderFailure(storyboardProviderDiagnostic({ code: event.code }, "stream", metadata));
    }
  }
  throw new Error("STORYBOARD_STREAM_INTERRUPTED");
  } catch (error) {
    throw error instanceof StoryboardProviderFailure ? error : new StoryboardProviderFailure(storyboardProviderDiagnostic(error, phase, metadata));
  }
}
