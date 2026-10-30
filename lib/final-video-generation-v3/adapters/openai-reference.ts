import "server-only";
import type OpenAI from "openai";
import { referencePrompt, type GenerationContext, type ReferenceSubject } from "../generation-context";

// The runtime image-edit adapter has no dependency on any Higgsfield/Soul path.
export function prepareOpenAIReference(model: string, images: Parameters<OpenAI["images"]["edit"]>[0]["image"],
  kind: "character" | "product" | "location", context: GenerationContext, subject?: ReferenceSubject) {
  return { model, image: images, prompt: referencePrompt(kind, context, subject), n: 1,
    size: "1024x1024" as const, quality: "high" as const, output_format: "png" as const, background: "opaque" as const };
}
