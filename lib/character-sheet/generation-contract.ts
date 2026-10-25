import { z } from "zod";

export const characterImageModel = "higgsfield-ai/soul/v2/image-to-image";
export const characterReferencePromptVersion = 4;
export const characterGenerationContractVersion = 4;
export const characterGenerationRevision = "face-back-front-v1";
export const characterGenerationOrder = ["face", "back", "front"] as const;
const historicalGenerationSchema = z.strictObject({
  promptVersion: z.literal(2), contractVersion: z.literal(2), revision: z.literal("single-view-local-front-v2"),
  builder: z.literal("characterViewPrompt"), promptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  providerModel: z.literal("higgsfield-ai/soul/v2/standard"), batchSize: z.literal(1), enhancePrompt: z.literal(false),
  resolution: z.literal("1080p"), aspectRatio: z.enum(["2:3", "1:1"]),
  outputRole: z.enum(["front_source", "back_reference", "face_reference"]),
});
export const characterInputReferenceSchema = z.strictObject({
  type: z.literal("character_front_source").optional(),
  kind: z.enum(["original", "front_source", "back_reference", "face_reference"]), assetId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  storageKey: z.string().min(1).max(512), etag: z.string().min(1).max(512),
});
const v3GenerationSchema = historicalGenerationSchema.extend({
  promptVersion: z.literal(3), contractVersion: z.literal(3), revision: z.literal("soul2-image-to-image-v1"),
  providerModel: z.literal(characterImageModel), enhancePrompt: z.literal(true),
  reference: characterInputReferenceSchema, soulId: z.uuid(), seed: z.number().int().min(1).max(1_000_000),
});
const upstreamAssetSchema = z.strictObject({ assetId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/) });
export const characterUpstreamSchema = z.strictObject({ face: upstreamAssetSchema.optional(), back: upstreamAssetSchema.optional() });
export type CharacterUpstream = z.infer<typeof characterUpstreamSchema>;
export const currentGenerationSchema = v3GenerationSchema.extend({
  promptVersion: z.literal(4), contractVersion: z.literal(4), revision: z.literal(characterGenerationRevision),
  slot: z.enum(characterGenerationOrder), upstream: characterUpstreamSchema,
}).refine(g => g.slot === "face" ? g.reference.kind === "original" && !g.upstream.face && !g.upstream.back :
  g.slot === "back" ? g.reference.kind === "original" && !!g.upstream.face && !g.upstream.back :
    g.reference.kind === "back_reference" && !!g.upstream.face && !!g.upstream.back &&
    g.reference.assetId === g.upstream.back.assetId && g.reference.sha256 === g.upstream.back.sha256);
export const characterGenerationSchema = z.union([historicalGenerationSchema, v3GenerationSchema, currentGenerationSchema]);
export type CharacterInputReference = z.infer<typeof characterInputReferenceSchema>;
export type CharacterGeneration = z.infer<typeof characterGenerationSchema>;
export function requiresFreshCharacterRequest(checkpoint: unknown) {
  if (!checkpoint || typeof checkpoint !== "object") return false;
  const op = checkpoint as Record<string, unknown>;
  return op.strategyRevision !== characterGenerationRevision &&
    (!op.generation || (op.generation as Record<string, unknown>).revision !== characterGenerationRevision);
}
export const frontCropSchema = z.strictObject({
  version: z.literal(1), sourceSha256: z.string().regex(/^[a-f0-9]{64}$/), canonicalSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceWidth: z.number().int().positive().max(4096), sourceHeight: z.number().int().positive().max(4096),
  top: z.number().int().nonnegative(), width: z.number().int().positive(), height: z.number().int().positive(),
});
