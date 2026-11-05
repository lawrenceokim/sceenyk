import { characterCastSchema, type DirectorStoryboard, type PlanningInput, type Reference } from "./contract";

export const CAST_PROMPT_COMPILER_VERSION = "approved-storyboard-cast-v1";
export function validateCharacterCast(storyboard: DirectorStoryboard, references: Pick<Reference, "id" | "role" | "characterId" | "name">[]) {
  const characters = references.filter(r => r.role === "character");
  if (!("cast" in storyboard)) {
    if (characters.length > 1) throw new Error("V3_CHARACTER_BINDINGS_REQUIRED");
    return;
  }
  const cast = characterCastSchema.parse(storyboard.cast);
  if (new Set(cast.map(c => c.characterId)).size !== cast.length || new Set(cast.map(c => c.referenceId)).size !== cast.length ||
    cast.length !== characters.length || cast.some(c => !characters.some(r => r.id === c.referenceId && r.characterId === c.characterId && r.name === c.name)))
    throw new Error("V3_CHARACTER_BINDINGS_CHANGED");
  const ids = new Set(cast.map(c => c.characterId));
  for (const scene of storyboard.scenes) {
    if (new Set(scene.characterIds).size !== scene.characterIds.length || scene.characterIds.some(id => !ids.has(id))) throw new Error("V3_CHARACTER_BINDINGS_INVALID");
    for (const speech of scene.speech) {
      if (speech.speaker === "narration" ? speech.characterId !== null : !speech.characterId || !scene.characterIds.includes(speech.characterId))
        throw new Error("V3_CHARACTER_SPEAKER_INVALID");
    }
  }
}

export function castCompilerInstructions(input: PlanningInput, from: number, to: number) {
  if (!("cast" in input.storyboardContent)) throw new Error("V3_CHARACTER_BINDINGS_REQUIRED");
  validateCharacterCast(input.storyboardContent, input.references);
  const cast = input.storyboardContent.cast;
  return ["Preserve each distinct character's own identity, outfit and voice. Never interchange identities or animate another character's dialogue.",
    ...cast.map(c => `Character ${JSON.stringify(c.name)} [${c.characterId}] is defined ONLY by approved image reference ${input.references.findIndex(r => r.id === c.referenceId) + 1}.`),
    ...input.storyboardContent.scenes.slice(from, to).flatMap(s => [
      `Shot ${s.number} visible cast: ${s.characterIds.map(id => { const c = cast.find(c => c.characterId === id)!; return `${JSON.stringify(c.name)} [${id}]`; }).join(", ") || "no characters"}.`,
      ...s.speech.map((line, i) => `Shot ${s.number} speech ${i + 1}: ${line.characterId ? `ONLY ${JSON.stringify(cast.find(c => c.characterId === line.characterId)!.name)} [${line.characterId}] speaks` : "off-screen narrator"}.`),
    ])].join("\n");
}
