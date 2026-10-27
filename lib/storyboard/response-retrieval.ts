import "server-only";
import OpenAI from "openai";
import { providerMetaSchema, type StoryboardProviderMeta } from "./recovery-contract";
import { captureStoryboardResponse } from "./response-capture";
import { storyboardProviderDiagnostic, StoryboardProviderFailure } from "./diagnostics";

// GET only. This module cannot create, repair, cancel or delete a response.
export async function retrieveStoryboardResponse(input: StoryboardProviderMeta, signal: AbortSignal) {
  const metadata = providerMetaSchema.parse(input);
  if (!metadata.stored || !metadata.responseId) return null;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new StoryboardProviderFailure(storyboardProviderDiagnostic(null, "retrieval", metadata));
  const client = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 30_000, logLevel: "off" });
  try {
    const response = await client.responses.retrieve(metadata.responseId, { signal });
    // Aliases can resolve to snapshot names. The saved response ID is binding.
    if (response.id !== metadata.responseId) throw new Error("STORYBOARD_RECOVERY_CHANGED");
    if (["queued", "in_progress"].includes(response.status ?? "")) return null;
    return captureStoryboardResponse(response, metadata);
  } catch (error) { throw new StoryboardProviderFailure(storyboardProviderDiagnostic(error, "retrieval", metadata)); }
}
