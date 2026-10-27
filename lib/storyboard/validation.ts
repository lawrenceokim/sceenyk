import { storyboardSchema, type Storyboard } from "./schema";
import type { StoryboardBinding } from "./contract";
import { StoryboardValidationError, schemaValidationIssues, validationPath, validationValue, type StoryboardValidationIssue } from "./validation-diagnostics";

export function inspectStoryboard(value: unknown, binding: StoryboardBinding) {
  const parsed = storyboardSchema.safeParse(value);
  if (!parsed.success) return { document: null, issues: schemaValidationIssues(parsed.error, value) };
  const doc = parsed.data; const issues: StoryboardValidationIssue[] = [];
  const add = (code: string, path: (string | number)[], expected: string | number, received: unknown, sceneNumber?: number) => {
    issues.push({ code, fieldPath: validationPath(path), expected, expectedType: typeof expected === "number" ? "number" : "constraint",
      ...validationValue(received), ...(sceneNumber === undefined ? {} : { sceneNumber }) });
  };
  if (![5000, 10_000, 30_000].includes(binding.durationMs)) add("DURATION_UNSUPPORTED", ["durationMs"], "5000, 10000 or 30000", binding.durationMs);
  for (const key of ["durationMs", "aspectRatio", "visualStyle", "tone"] as const) if (doc[key] !== binding[key]) add("SETTING_BINDING_MISMATCH", [key], key === "durationMs" ? binding[key] : `selected ${key}`, doc[key]);
  if (doc.voice.characterAssetId !== binding.character) add("CHARACTER_BINDING_MISMATCH", ["voice", "characterAssetId"], "approved Character sheet UUID", doc.voice.characterAssetId);
  let end = 0;
  for (const [index, scene] of doc.scenes.entries()) {
    const p = ["scenes", index]; const number = index + 1;
    if (scene.number !== number) add("SCENE_NUMBER_INVALID", [...p, "number"], number, scene.number, number);
    if (scene.startMs !== end) add(scene.startMs < end ? "SCENE_OVERLAP" : "SCENE_GAP", [...p, "startMs"], end, scene.startMs, number);
    if (scene.endMs <= scene.startMs || scene.endMs > doc.durationMs) add("SCENE_INTERVAL_INVALID", [...p, "endMs"], `>${scene.startMs} and <=${doc.durationMs} milliseconds`, scene.endMs, number);
    for (const [key, expected] of [["characterAssetId", binding.character], ["productAssetId", binding.product], ["locationAssetId", binding.location]] as const) if (scene[key] !== expected) add("ASSET_BINDING_MISMATCH", [...p, key], "exact approved asset UUID for this role", scene[key], number);
    if (![binding.character, binding.product, binding.location].every(id => scene.generationPrompt.includes(`asset:${id}`))) add("PROMPT_ASSET_REFERENCE_MISSING", [...p, "generationPrompt"], "all three approved asset references", scene.generationPrompt, number);
    let actionEnd = scene.startMs;
    for (const [i, action] of scene.actions.entries()) {
      const a = [...p, "actions", i];
      if (action.startMs < actionEnd) add("ACTION_OVERLAP", [...a, "startMs"], `>=${actionEnd} milliseconds`, action.startMs, number);
      if (action.endMs - action.startMs < 700) add("ACTION_TOO_SHORT", [...a, "endMs"], "action duration >=700 milliseconds", action.endMs - action.startMs, number);
      if (action.endMs > scene.endMs) add("ACTION_OUTSIDE_SCENE", [...a, "endMs"], `<=${scene.endMs} milliseconds`, action.endMs, number);
      actionEnd = action.endMs;
    }
    let speechEnd = scene.startMs;
    const rate = doc.voice.pace === "slow" ? 1.8 : doc.voice.pace === "natural" ? 2.3 : 2.7;
    for (const [i, speech] of scene.speech.entries()) {
      const s = [...p, "speech", i]; const seconds = (speech.endMs - speech.startMs) / 1000;
      if (!speech.text) add("SPEECH_TEXT_EMPTY", [...s, "text"], "nonempty spoken text", speech.text, number);
      if (speech.characterAssetId !== binding.character) add("SPEAKER_BINDING_MISMATCH", [...s, "characterAssetId"], "approved Character sheet UUID", speech.characterAssetId, number);
      if (speech.startMs < speechEnd) add("SPEECH_OVERLAP", [...s, "startMs"], `>=${speechEnd} milliseconds`, speech.startMs, number);
      if (seconds <= 0 || speech.endMs > scene.endMs) add("SPEECH_INTERVAL_INVALID", [...s, "endMs"], `>${speech.startMs} and <=${scene.endMs} milliseconds`, speech.endMs, number);
      if (seconds > 0) {
        const words = speech.text ? speech.text.split(/\s+/u).length : 0;
        const chars = [...speech.text.replace(/\s/gu, "")].length;
        if (words > Math.floor(seconds * rate)) add("SPEECH_WORD_BUDGET_EXCEEDED", [...s, "wordCount"], `<=${Math.floor(seconds * rate)} words (${rate}/second)`, words, number);
        if (chars > Math.floor(seconds * 16)) add("SPEECH_CHARACTER_BUDGET_EXCEEDED", [...s, "characterCount"], `<=${Math.floor(seconds * 16)} nonspace characters`, chars, number);
      }
      speechEnd = speech.endMs;
    }
    end = scene.endMs;
  }
  if (end !== doc.durationMs) add("TOTAL_DURATION_MISMATCH", ["durationMs"], doc.durationMs, end);
  return { document: doc, issues };
}
export function validateStoryboard(value: unknown, binding: StoryboardBinding): Storyboard {
  const result = inspectStoryboard(value, binding);
  if (!result.document || result.issues.length) throw new StoryboardValidationError({ validatorVersion: 2, valid: false, issues: result.issues, normalizations: [] });
  return result.document;
}
