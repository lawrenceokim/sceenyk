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
export type CharacterOriginal = { id: string; name: string };
export type ReferenceOriginals = { character: string | null; product: string | null; characters?: CharacterOriginal[];
  names?: { character: string | null; product: string | null; characters?: CharacterOriginal[] } };
export const originalCharacters = (originals: ReferenceOriginals): CharacterOriginal[] => originals.characters ?? (originals.character ? [{ id: originals.character, name: originals.names?.character ?? "" }] : []);
export function characterSubject(value: { document?: Record<string, unknown>; input?: Record<string, unknown> }): string | undefined {
  const doc = value.document ?? value.input;
  const id = (doc?.original as { id?: unknown } | undefined)?.id ?? doc?.originalId;
  return typeof id === "string" ? id : undefined;
}
export function usesCharacterSlots(w: { project?: { studio_mode?: string }; artifacts: Artifact[]; tasks?: { input: Record<string, unknown> }[] }) {
  return w.project?.studio_mode === "pro" || w.artifacts.some(a => !!(a.document.input as { characterSlot?: unknown } | undefined)?.characterSlot) || w.tasks?.some(t => !!t.input.characterSlot) === true;
}
export const referenceSubjectSchema = z.strictObject({ role: z.enum(["character", "product"]), originalId: z.uuid(), name: z.string().max(500) });
export type ReferenceSubject = z.infer<typeof referenceSubjectSchema>;
export function generationContext(brief: { visual_style: string; creation_type: string; ugc_type: string; prompt: string; tone: string; category: string }): GenerationContext {
  return generationContextSchema.parse({ version: 1, visualStyle: brief.visual_style, creationType: brief.creation_type,
    type: brief.ugc_type, instructions: brief.prompt, tone: brief.tone, category: brief.category });
}
export type ReferenceDeletion = { id?: string; kind: string; artifact_version: number; state: string; subjectId?: string | null };
export const referenceDeletedVersion = (deletions: ReferenceDeletion[] = [], kind: string, subjectId?: string) =>
  Math.max(0, ...deletions.filter(d => d.kind === kind && d.state === "completed" && (!subjectId || !d.subjectId || d.subjectId === subjectId)).map(d => d.artifact_version));
export const latestArtifact = (w: { artifacts: Artifact[]; referenceDeletions?: ReferenceDeletion[] }, kind: Artifact["kind"], subjectId?: string) =>
  w.artifacts.filter(a => a.kind === kind && (!subjectId || characterSubject(a) === subjectId) && a.version > referenceDeletedVersion(w.referenceDeletions, kind, kind === "character" ? characterSubject(a) : subjectId)).sort((a, b) => a.version - b.version).at(-1);
export function requiredReferenceArtifacts(w: { artifacts: Artifact[]; referenceDeletions?: ReferenceDeletion[] }, originals: ReferenceOriginals, location = false) {
  return [...originalCharacters(originals).map(c => latestArtifact(w, "character", c.id)),
    ...(originals.product ? [latestArtifact(w, "product")] : []), ...(location ? [latestArtifact(w, "location")] : [])];
}
export function characterCast(w: { artifacts: Artifact[]; referenceDeletions?: ReferenceDeletion[] }, originals: ReferenceOriginals) {
  return originalCharacters(originals).map(c => ({ characterId: c.id, name: c.name, referenceId: latestArtifact(w, "character", c.id)?.id ?? null }));
}

export function artifactCurrent(a: Artifact, artifacts: Artifact[], context: GenerationContext, originals: ReferenceOriginals, briefHash?: string, deletions: ReferenceDeletion[] = []): boolean {
  if (a.kind === "joined") return true; // Final media uses the immutable package currentness fence.
  if (a.rejected_at || deletions.some(d => d.id === a.id && d.state === "prepared") || latestArtifact({ artifacts, referenceDeletions: deletions }, a.kind, a.kind === "character" ? characterSubject(a) : undefined)?.id !== a.id) return false;
  const input = z.object({ generationContext: generationContextSchema, references: z.array(z.string()).optional() }).safeParse(a.document.input);
  if (!input.success) return false;
  if (a.kind === "character" || a.kind === "product") {
    const original = z.object({ id: z.string() }).safeParse(a.document.original);
    // Sheets depend on their uploaded subject and Visual Style. The complete
    // generation snapshot stays intact for provenance, not as a sheet dependency.
    return original.success && (a.kind === "character" ? originalCharacters(originals).some(c => c.id === original.data.id) : original.data.id === originals.product) &&
      input.data.generationContext.visualStyle === context.visualStyle;
  }
  if (v3Digest("generation-context", input.data.generationContext) !== v3Digest("generation-context", context)) return false;
  if (a.kind === "storyboard" && briefHash && a.document.input && (a.document.input as { briefHash?: string }).briefHash !== briefHash) return false;
  const w = { artifacts, referenceDeletions: deletions };
  const cast = (a.document.input as { cast?: unknown }).cast;
  if (cast !== undefined && v3Digest("character-cast", cast) !== v3Digest("character-cast", characterCast(w, originals))) return false;
  if (originals.characters && cast === undefined) return false;
  const refs = requiredReferenceArtifacts(w, originals, a.kind === "storyboard");
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
