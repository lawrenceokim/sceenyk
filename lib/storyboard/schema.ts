import { z } from "zod";
import { tones, visualStyles } from "@/lib/projects/options";

const text = z.string().trim().min(1).max(2000);
const ms = z.number().int().min(0).max(30_000);
export const storyboardSceneSchema = z.strictObject({
  number: z.number().int().min(1).max(10), startMs: ms, endMs: ms,
  purpose: text, description: text, characterAssetId: z.uuid(), productAssetId: z.uuid(), locationAssetId: z.uuid(),
  actions: z.array(z.strictObject({ startMs: ms, endMs: ms, movement: text, gesture: text, expression: text })).min(1).max(8),
  productInteraction: text, productPosition: text,
  camera: z.strictObject({ angle: text, shot: text, framing: text, movement: text, zoom: text, focus: text }),
  lighting: z.strictObject({ direction: text, intensity: text, colors: text, atmosphere: text }),
  speech: z.array(z.strictObject({ startMs: ms, endMs: ms, speaker: z.enum(["character", "narration"]), characterAssetId: z.uuid(), text: z.string().trim().max(1000), delivery: text })).max(8),
  audio: z.strictObject({ background: text, effects: text, music: text }), transition: text,
  generationNotes: z.string().trim().max(2000), generationPrompt: z.string().trim().min(1).max(16_000),
});
export const storyboardSchema = z.strictObject({
  schemaVersion: z.literal(1), title: z.string().trim().min(1).max(120), concept: text,
  durationMs: z.number().int().min(5000).max(30_000), aspectRatio: z.enum(["9:16", "16:9", "1:1"]), visualStyle: z.enum(visualStyles), tone: z.enum(tones),
  voice: z.strictObject({ characterAssetId: z.uuid(), description: text, pace: z.enum(["slow", "natural", "energetic"]) }),
  continuity: z.strictObject({ identity: text, appearance: text, outfit: text, product: text, location: text }),
  scenes: z.array(storyboardSceneSchema).min(1).max(10),
});
export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;
