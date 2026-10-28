import { storyboardBinding, type StoryboardInput } from "./contract";
import { normalizeStoryboardOutput } from "./normalization";
import { minimumActionMs, preferredActionMs, speechIntervalBudget, storyboardSpeechPlan } from "./speech-budget";
import { StoryboardValidationError } from "./validation-diagnostics";

const speechRules = new Set(["SPEECH_WORD_BUDGET_EXCEEDED", "SPEECH_CHARACTER_BUDGET_EXCEEDED"]);
const timingRules = new Set([...speechRules, "SPEECH_OVERLAP", "SPEECH_INTERVAL_INVALID", "ACTION_TOO_SHORT", "ACTION_OVERLAP", "ACTION_OUTSIDE_SCENE", "SCENE_OVERLAP", "SCENE_GAP", "SCENE_INTERVAL_INVALID", "TOTAL_DURATION_MISMATCH"]);
export function storyboardCorrection(output: string, input: StoryboardInput, error: unknown) {
  const report = error instanceof StoryboardValidationError ? error.report : undefined;
  const issue = report ? JSON.stringify(report) : error instanceof Error && /^STORYBOARD_[A-Z_]+$/.test(error.message) ? error.message : "STORYBOARD_STRUCTURE_INVALID";
  const base = { output, issue, mode: "contract" as "contract" | "speech_timing_only" | "timing_only", instruction:
    "Correct every reported contract failure and return the complete storyboard using the existing schema, separate preferred targets/absolute maxima, minimum action times and final timing verification." };
  if (!report?.issues.length || !report.issues.every(item => timingRules.has(item.code))) return base;
  try {
    const binding = storyboardBinding(input);
    const doc = normalizeStoryboardOutput(output, binding).document;
    const speechFailures = new Map<string, { sceneNumber: number; lineNumber: number; fieldPath: string; rules: string[];
      currentWordCount: number; currentNonspaceCharacters: number } & ReturnType<typeof speechIntervalBudget>>();
    const actionFailures = new Map<string, { sceneNumber: number; actionNumber: number; lineNumber: null; fieldPath: string; rules: string[];
      startMs: number; endMs: number; availableDurationMs: number; currentActionDurationMs: number; minimumActionMs: number; preferredActionMs: number }>();
    for (const item of report.issues) {
      const speechMatch = /^\$\.scenes\[(\d+)\]\.speech\[(\d+)\]\./.exec(item.fieldPath);
      const actionMatch = /^\$\.scenes\[(\d+)\]\.actions\[(\d+)\]\./.exec(item.fieldPath);
      if (speechMatch) {
        const scene = doc.scenes[Number(speechMatch[1])]; const lineIndex = Number(speechMatch[2]); const speech = scene?.speech[lineIndex];
        if (!scene || !speech) return base;
        const fieldPath = `$.scenes[${speechMatch[1]}].speech[${speechMatch[2]}]`; const prior = speechFailures.get(fieldPath);
        if (prior) prior.rules.push(item.code);
        else speechFailures.set(fieldPath, { sceneNumber: scene.number, lineNumber: lineIndex + 1, fieldPath, rules: [item.code],
          ...speechIntervalBudget(speech.startMs, Math.max(speech.startMs, speech.endMs), typeof speech.delivery === "string" ? doc.voice.pace : speech.delivery.pace), endMs: speech.endMs, durationMs: speech.endMs - speech.startMs,
          currentWordCount: speech.text ? speech.text.split(/\s+/u).length : 0, currentNonspaceCharacters: [...speech.text.replace(/\s/gu, "")].length });
      } else if (actionMatch) {
        const scene = doc.scenes[Number(actionMatch[1])]; const index = Number(actionMatch[2]); const action = scene?.actions[index];
        if (!scene || !action) return base;
        const fieldPath = `$.scenes[${actionMatch[1]}].actions[${actionMatch[2]}]`; const prior = actionFailures.get(fieldPath);
        if (prior) prior.rules.push(item.code);
        else actionFailures.set(fieldPath, { sceneNumber: scene.number, actionNumber: index + 1, lineNumber: null, fieldPath, rules: [item.code],
          startMs: action.startMs, endMs: action.endMs, currentActionDurationMs: action.endMs - action.startMs,
          availableDurationMs: Math.max(0, (scene.actions[index + 1]?.startMs ?? scene.endMs) - Math.max(scene.startMs, scene.actions[index - 1]?.endMs ?? scene.startMs)),
          minimumActionMs, preferredActionMs });
      }
    }
    // Scene coverage failures cannot reuse invalid intervals as a hard plan.
    let timingPlan;
    try { timingPlan = storyboardSpeechPlan(binding.durationMs, doc.scenes); }
    catch { timingPlan = storyboardSpeechPlan(binding.durationMs); }
    return { ...base, mode: report.issues.every(item => speechRules.has(item.code)) ? "speech_timing_only" as const : "timing_only" as const,
      instruction: "Only timing validation failed. Shorten only affected dialogue/narration to its preferred word/character target; never exceed the absolute maximum. Preserve supported meaning, story beats, approved assets, stable voice pace, scene purposes, camera, lighting and overall scene structure. Keep unaffected dialogue/actions unchanged when feasible. For each affected action, extend/rebalance into available unspoken time toward 900ms, never below 700ms; simplify or use fewer actions if needed. Do NOT shorten physical actions to make room for speech. Keep scene boundaries when feasible; rebalance affected intervals only if necessary and preserve exact selected total duration with no overlaps/gaps. Respect action/reaction/camera/transition reserves; a 5s/10s scene may contain no dialogue. timingFailures and actionTimingFailures show ORIGINAL timestamps, available duration, actual counts/durations, preferred targets and absolute minima/maxima. Prefer target values, not ceiling values. Independently re-check EVERY scene/line/action (A-H) before returning the complete storyboard, never a patch.",
      timingFailures: [...speechFailures.values()], actionTimingFailures: [...actionFailures.values()],
      sceneTimingFailures: report.issues.filter(item => !/\.speech\[|\.actions\[/.test(item.fieldPath)), timingPlan };
  } catch { return base; }
}
export type StoryboardCorrection = ReturnType<typeof storyboardCorrection>;
