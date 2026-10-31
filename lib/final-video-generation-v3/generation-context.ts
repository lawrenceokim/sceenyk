import { z } from "zod";
import { saveProjectSchema } from "@/lib/projects/validation";
import type { Artifact } from "./runtime-contract";
import { v3Digest } from "./identity";
import { buildReferenceSheetPrompt } from "./reference-sheet-prompt";

// Structured, saved Studio inputs. No client-supplied style or inferred prompt tags.
export const generationContextSchema = z.strictObject({
  version: z.literal(1), visualStyle: saveProjectSchema.shape.settings.shape.visualStyle,
  creationType: saveProjectSchema.shape.creationType, type: saveProjectSchema.shape.ugcType,
  instructions: saveProjectSchema.shape.prompt, tone: saveProjectSchema.shape.settings.shape.tone,
  category: saveProjectSchema.shape.category,
});
export type GenerationContext = z.infer<typeof generationContextSchema>;
export type ReferenceOriginals = { character: string | null; product: string | null; names?: { character: string | null; product: string | null } };
export const referenceSubjectSchema = z.strictObject({ role: z.enum(["character", "product"]), originalId: z.uuid(), name: z.string().max(500) });
export type ReferenceSubject = z.infer<typeof referenceSubjectSchema>;
export function generationContext(brief: { visual_style: string; creation_type: string; ugc_type: string; prompt: string; tone: string; category: string }): GenerationContext {
  return generationContextSchema.parse({ version: 1, visualStyle: brief.visual_style, creationType: brief.creation_type,
    type: brief.ugc_type, instructions: brief.prompt, tone: brief.tone, category: brief.category });
}
export type ReferenceDeletion = { id?: string; kind: string; artifact_version: number; state: string };
export const referenceDeletedVersion = (deletions: ReferenceDeletion[] = [], kind: string) =>
  Math.max(0, ...deletions.filter(d => d.kind === kind && d.state === "completed").map(d => d.artifact_version));
export const latestArtifact = (w: { artifacts: Artifact[]; referenceDeletions?: ReferenceDeletion[] }, kind: Artifact["kind"]) =>
  w.artifacts.filter(a => a.kind === kind && a.version > referenceDeletedVersion(w.referenceDeletions, kind)).sort((a, b) => a.version - b.version).at(-1);

export function artifactCurrent(a: Artifact, artifacts: Artifact[], context: GenerationContext, originals: ReferenceOriginals, briefHash?: string, deletions: ReferenceDeletion[] = []): boolean {
  if (a.kind === "joined") return true; // Final media uses the immutable package currentness fence.
  if (a.rejected_at || deletions.some(d => d.id === a.id && d.state === "prepared") || latestArtifact({ artifacts, referenceDeletions: deletions }, a.kind)?.id !== a.id) return false;
  const input = z.object({ generationContext: generationContextSchema, references: z.array(z.string()).optional() }).safeParse(a.document.input);
  if (!input.success || v3Digest("generation-context", input.data.generationContext) !== v3Digest("generation-context", context)) return false;
  if (a.kind === "character" || a.kind === "product") {
    const original = z.object({ id: z.string() }).safeParse(a.document.original);
    return original.success && original.data.id === originals[a.kind];
  }
  if (a.kind === "storyboard" && briefHash && a.document.input && (a.document.input as { briefHash?: string }).briefHash !== briefHash) return false;
  const kinds = ["character", ...(originals.product ? ["product" as const] : []), ...(a.kind === "storyboard" ? ["location" as const] : [])] as const;
  const refs = kinds.map(kind => latestArtifact({ artifacts, referenceDeletions: deletions }, kind as Artifact["kind"]));
  return refs.every(ref => ref?.approved_at && artifactCurrent(ref, artifacts, context, originals, briefHash, deletions)) &&
    JSON.stringify(input.data.references) === JSON.stringify(refs.map(ref => ref!.id));
}

const treatments: Record<GenerationContext["visualStyle"], string> = {
  Original: "Preserve the natural/original visual appearance of the supplied subject as closely as appropriate.",
  Cartoon: "Use a coherent cartoon illustration treatment, simplified shapes and consistent drawn shading.",
  Cinematic: "Use cinematic lighting, rich detail and filmic treatment while preserving the required subject.",
  Anime: "Use a coherent anime illustration treatment, consistent linework and anime shading.",
  Realistic: "Use photorealistic materials, natural anatomy, realistic detail and believable lighting.",
};
export function referencePrompt(kind: "character" | "product" | "location", context: GenerationContext, subject?: ReferenceSubject) {
  if (kind !== "location") return buildReferenceSheetPrompt(kind, context, subject);
  return "Create one Location reference for the saved Studio direction. " +
    "Show one clear primary environment suitable for the approved Character and optional Product references. " +
    `Required visual treatment: ${treatments[context.visualStyle]} Character, Product and Location must belong to this same creative world. ` +
    "Apply the style without substituting identity or inventing extra people/products. Treat user instructions as creative direction within these identity requirements. " +
    `Structured generation context: ${JSON.stringify(context)}. ` +
    (subject ? `Supplied reference subject: ${JSON.stringify(subject)}. This is the saved subject name, not a request to substitute a different subject.` : "");
}
