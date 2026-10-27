import "server-only";
import type { Response as OpenAIResponse } from "openai/resources/responses/responses";
import type { StoryboardProviderMeta } from "./recovery-contract";
import type { StoryboardSavedResponse } from "./spool";

// No JSON/storyboard parsing here. Preserve terminal output before validation,
// claim/DB writes or any optional corrective request.
export function captureStoryboardResponse(response: OpenAIResponse,
  meta: Pick<StoryboardProviderMeta, "responseId" | "requestId"> & { clientRequestId: string | null; stored: boolean | null }): StoryboardSavedResponse {
  if (response.id !== meta.responseId || !["completed", "failed", "incomplete", "cancelled"].includes(response.status ?? "")) throw new Error("STORYBOARD_RESPONSE_INVALID");
  let refused = false; const parts: string[] = [];
  for (const item of response.output) if (item.type === "message") for (const content of item.content) {
    if (content.type === "refusal") refused = true;
    else if (content.type === "output_text") parts.push(content.text);
  }
  const output = parts.join("");
  if (Buffer.byteLength(output) > 250_000) throw new Error("STORYBOARD_RESPONSE_TOO_LARGE");
  return { output, receipt: { provider: "openai", responseId: response.id, requestId: meta.requestId,
    clientRequestId: meta.clientRequestId, stored: meta.stored, model: response.model, status: response.status,
    refused, usage: response.usage ?? null, incompleteReason: response.incomplete_details?.reason ?? null } };
}
