import "server-only";
import type { ResponseCreateParamsNonStreaming } from "openai/resources/responses/responses";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { directorStoryboardSchema, V3_WORKFLOW, type CreativeDirectorProvider, type ImageGenerationProvider } from "../contract";

const model = z.string().regex(/^[a-zA-Z0-9._:-]{1,200}$/);
const prompt = z.string().trim().min(1).max(64000);
function image(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw new Error("REFERENCE_URL_INVALID");
  return { type: "input_image" as const, image_url: url, detail: "high" as const };
}
export class OpenAIImageGenerationProvider implements ImageGenerationProvider<ResponseCreateParamsNonStreaming> {
  constructor(private readonly config: { mainlineModel: string; imageModel: string }) { model.parse(config.mainlineModel); model.parse(config.imageModel); }
  prepareReference(input: { instruction: string; identityInstructions: string; referenceUrls: readonly string[] }) {
    if (!input.referenceUrls.length) throw new Error("REFERENCE_IMAGE_REQUIRED");
    const body: ResponseCreateParamsNonStreaming = { model: this.config.mainlineModel, store: false,
      input: [{ role: "user", content: [{ type: "input_text", text: `${prompt.parse(input.instruction)}\nPreserve identity and visual characteristics: ${prompt.parse(input.identityInstructions)}` }, ...input.referenceUrls.map(image)] }],
      tools: [{ type: "image_generation", action: "edit", model: this.config.imageModel }], tool_choice: { type: "image_generation" } };
    return { workflow: V3_WORKFLOW, executable: false as const, providerId: "openai", body };
  }
}
export class OpenAICreativeDirectorProvider implements CreativeDirectorProvider<ResponseCreateParamsNonStreaming> {
  constructor(private readonly config: { model: string; maxOutputTokens: number }) { model.parse(config.model); z.number().int().positive().parse(config.maxOutputTokens); }
  prepareStoryboard(input: { instruction: string; durationMs: number; referenceUrls: readonly string[] }) {
    z.number().int().min(1).max(600000).parse(input.durationMs);
    const body: ResponseCreateParamsNonStreaming = { model: this.config.model, store: false, max_output_tokens: this.config.maxOutputTokens,
      instructions: "Act as a professional film director. Return the structured Storyboard with complete scene order/timing, exact dialogue, actions/reactions, product interactions, camera/zoom/cuts/transitions, lighting, environment, pacing, visual style and native sound intentions. Scenes are creative units, not independent video requests. Preserve the approved reference identities. Do not invent additional people or products.",
      input: [{ role: "user", content: [{ type: "input_text", text: `${prompt.parse(input.instruction)}\nExact intended total: ${input.durationMs}ms.` }, ...input.referenceUrls.map(image)] }],
      text: { format: zodTextFormat(directorStoryboardSchema, "director_storyboard_v3") } };
    return { workflow: V3_WORKFLOW, executable: false as const, providerId: "openai", body };
  }
  parseStoryboard(value: unknown) { return directorStoryboardSchema.parse(value); }
}
