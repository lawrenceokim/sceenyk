import { z } from "zod";
import { tones, visualStyles } from "@/lib/projects/options";
import { transitionSchema, voiceDeliverySchema, audioCueSchema } from "@/lib/execution-v1/contract";

const text = z.string().trim().min(1).max(2000);
const ms = z.number().int().min(0).max(30_000);
export const legacyStoryboardSceneSchema = z.strictObject({
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
const header = z.strictObject({
  schemaVersion: z.literal(1), title: z.string().trim().min(1).max(120), concept: text,
  durationMs: z.number().int().min(5000).max(30_000), aspectRatio: z.enum(["9:16", "16:9", "1:1"]), visualStyle: z.enum(visualStyles), tone: z.enum(tones),
  voice: z.strictObject({ characterAssetId: z.uuid(), description: text, pace: z.enum(["slow", "natural", "energetic"]) }),
  continuity: z.strictObject({ identity: text, appearance: text, outfit: text, product: text, location: text }),
  scenes: z.array(legacyStoryboardSceneSchema).min(1).max(10),
});
export const legacyStoryboardSchema = header;
export const executableStoryboardSceneSchema = legacyStoryboardSceneSchema.extend({ transition: transitionSchema, transitionNote: z.string().max(2000),
  audio: z.strictObject({ background: audioCueSchema, effects: audioCueSchema, music: audioCueSchema }),
  speech: z.array(legacyStoryboardSceneSchema.shape.speech.element.extend({ delivery: voiceDeliverySchema, deliveryNote: z.string().max(2000) })).max(8) });
export const executableStoryboardSchema = header.extend({ schemaVersion: z.literal(2), voice: header.shape.voice.extend({ description: z.string().trim().min(20).max(700) }), scenes: z.array(executableStoryboardSceneSchema).min(1).max(10) });
// Historical reads retain exact schema-1 fields. Semantic validation below also
// checks the version-specific strict schema; mixed execution shapes never pass.
export const storyboardSceneSchema = legacyStoryboardSceneSchema.extend({
  transition: z.union([z.string().trim().min(1).max(2000), transitionSchema]), transitionNote: z.string().max(2000).optional(),
  audio: z.strictObject({ background: z.union([z.string(), audioCueSchema]), effects: z.union([z.string(), audioCueSchema]), music: z.union([z.string(), audioCueSchema]) }),
  speech: z.array(legacyStoryboardSceneSchema.shape.speech.element.extend({ delivery: z.union([z.string(), voiceDeliverySchema]), deliveryNote: z.string().max(2000).optional() })).max(8),
});
export const storyboardSchema = header.extend({ schemaVersion: z.literal([1, 2]), scenes: z.array(storyboardSceneSchema).min(1).max(10) });
export type Storyboard = z.infer<typeof storyboardSchema>;
export type StoryboardScene = z.infer<typeof storyboardSceneSchema>;
export type ExecutableStoryboard = z.infer<typeof executableStoryboardSchema>;
