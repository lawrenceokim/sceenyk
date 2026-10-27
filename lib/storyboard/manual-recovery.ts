import { finalizeStoryboard, inspectPreparedStoryboard, storyboardSchema, type Storyboard, type StoryboardRow } from "./contract";
import { schemaValidationIssues, StoryboardValidationError } from "./validation-diagnostics";
import { speechIntervalBudget } from "./speech-budget";

export class StoryboardManualRecoveryError extends Error {
  constructor(readonly code: "STORYBOARD_MANUAL_RECOVERY_UNAVAILABLE" | "STORYBOARD_DIALOGUE_ONLY" | "STORYBOARD_MANUAL_RECOVERY_SETUP") { super(code); }
}
const speechRules = new Set(["SPEECH_WORD_BUDGET_EXCEEDED", "SPEECH_CHARACTER_BUDGET_EXCEEDED"]);

// DB-saved completed JSON only. Never reads/retrieves a provider response or
// rewrites dialogue. A malformed or non-speech failure is not an editable repair.
export function manualStoryboardCandidates(row: StoryboardRow) {
  const candidates: { requestIndex: number; document: Storyboard }[] = [];
  if (row.state !== "failed" || row.error_code !== "STORYBOARD_OUTPUT_INVALID") return candidates;
  for (let index = row.requests.length - 1; index >= 0; index--) {
    const request = row.requests[index];
    if (request.receipt?.status !== "completed" || request.receipt.refused === true || typeof request.output !== "string") continue;
    try {
      const parsed = storyboardSchema.safeParse(JSON.parse(request.output));
      if (!parsed.success) continue;
      const report = inspectPreparedStoryboard(parsed.data, row.input).report;
      if (report.issues.length && report.issues.every(issue => speechRules.has(issue.code)) && parsed.data.scenes.every(scene => scene.speech.every(line =>
        speechIntervalBudget(line.startMs, line.endMs, parsed.data.voice.pace).maximumWords >= 1))) candidates.push({ requestIndex: index, document: parsed.data });
    } catch { /* Immutable originals remain available for inspection. */ }
  }
  return candidates;
}
function withoutDialogue(doc: Storyboard) {
  return { ...doc, scenes: doc.scenes.map(scene => ({ ...scene, generationPrompt: "", speech: scene.speech.map(line => ({ ...line, text: "" })) })) };
}
export function prepareManualStoryboard(row: StoryboardRow, index: number | undefined, value: unknown) {
  const candidate = manualStoryboardCandidates(row).find(item => item.requestIndex === index);
  if (!candidate) throw new StoryboardManualRecoveryError("STORYBOARD_MANUAL_RECOVERY_UNAVAILABLE");
  const edited = storyboardSchema.safeParse(value);
  if (!edited.success) throw new StoryboardValidationError({ validatorVersion: 2, valid: false, issues: schemaValidationIssues(edited.error, value), normalizations: [] });
  // Timestamps, pace, speakers, number of lines/actions, assets, camera and all
  // other creative fields remain fixed. Prompts are derived again on save.
  if (JSON.stringify(withoutDialogue(candidate.document)) !== JSON.stringify(withoutDialogue(edited.data))) throw new StoryboardManualRecoveryError("STORYBOARD_DIALOGUE_ONLY");
  return finalizeStoryboard(edited.data, row.input);
}
