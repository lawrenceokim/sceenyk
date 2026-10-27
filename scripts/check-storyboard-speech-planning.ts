// Pure prompt/planning/schema/timing/static checks. No environment loading,
// provider/worker import, API call, database, recovery file or job execution.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { storyboardPrompt } from "../lib/storyboard/prompt";
import { storyboardSpeechPlan, speechIntervalBudget, speechRates } from "../lib/storyboard/speech-budget";
import { storyboardCorrection } from "../lib/storyboard/correction";
import { storyboardBinding, storyboardMaxRequests, inspectPreparedStoryboard, validateStoryboard, type StoryboardInput, type Storyboard } from "../lib/storyboard/contract";
import { StoryboardValidationError } from "../lib/storyboard/validation-diagnostics";

let checks = 0; let networkCalls = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (v: unknown) => { assert.ok(v); checks++; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const detail = "Preserve approved reference.";
const asset = (n: number) => ({ id: id(n), storageKey: "PRIVATE_NOT_FOR_PROMPT", etag: "private", sha256: "a".repeat(64), sizeBytes: 100, mimeType: "image/png" });
function input(seconds: number): StoryboardInput { return { scene: { sceneDescription: "Show mug", character: { name: "Maya" }, product: { name: "Mug" },
  settings: { duration: String(seconds), aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" }, narration: { mode: "prompt" } },
  dependencies: {}, character: asset(1), product: asset(2), location: asset(3), locationPlan: {}, wardrobe: null }; }
function document(seconds: number, pace: Storyboard["voice"]["pace"]): Storyboard {
  const plan = storyboardSpeechPlan(seconds * 1000);
  return { schemaVersion: 1, title: "Mug", concept: detail, durationMs: seconds * 1000, aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional",
    voice: { characterAssetId: id(1), description: "Original natural voice", pace }, continuity: { identity: detail, appearance: detail, outfit: detail, product: detail, location: detail },
    scenes: plan.scenes.map(scene => ({ number: scene.number, startMs: scene.startMs, endMs: scene.endMs, purpose: detail, description: detail,
      characterAssetId: id(1), productAssetId: id(2), locationAssetId: id(3), actions: [{ startMs: scene.actionAndCamera.startMs, endMs: scene.actionAndCamera.endMs, movement: detail, gesture: detail, expression: detail }],
      productInteraction: detail, productPosition: detail, camera: { angle: detail, shot: detail, framing: detail, movement: "Static", zoom: "None", focus: detail },
      lighting: { direction: detail, intensity: detail, colors: detail, atmosphere: detail },
      speech: [{ startMs: scene.speakingWindow.startMs, endMs: scene.speakingWindow.endMs, speaker: "character", characterAssetId: id(1), text: Array(scene.limitsByPace[pace].preferredTargetWords).fill("a").join(" "), delivery: detail }],
      audio: { background: detail, effects: "None", music: "None" }, transition: detail, generationNotes: "", generationPrompt: `asset:${id(1)} asset:${id(2)} asset:${id(3)}` })) };
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
try {
  for (const [seconds, count, spokenMs, words, chars] of [[5, 1, 2800, 6, 48], [10, 2, 5600, 12, 96], [30, 5, 17000, 40, 285]]) {
    const savedInput = input(seconds); const before = JSON.stringify(savedInput);
    const prompt = storyboardPrompt(savedInput); const plan = prompt.context.speechTimingPlan;
    equal(plan.sceneCount, count); equal(plan.availableSpeechMs, spokenMs);
    equal(plan.limitsByPace.natural.maximumSpokenWords, words); equal(plan.limitsByPace.natural.maximumNonspaceCharacters, chars);
    equal(plan.reservedNonSpeakingMs + plan.pauseReserveMs + plan.availableSpeechMs, seconds * 1000);
    ok(plan.maximumSpeechWindowMs <= seconds * 600); equal(plan.hardLimits, true);
    equal(plan.scenes[0].startMs, 0); equal(plan.scenes.at(-1)?.endMs, seconds * 1000);
    equal(JSON.stringify(savedInput), before); ok(!JSON.stringify(prompt).includes("PRIVATE_NOT_FOR_PROMPT"));
    const order = ["A. Total video duration", "B. Number of scenes", "C. Exact scene start/end", "D. Required physical action", "E. Remaining speech time", "F. Speech target AND hard maximum", "G. Final concise dialogue", "H. Final timing verification"];
    ok(order.every((text, i) => prompt.instructions.includes(text) && (!i || prompt.instructions.indexOf(order[i - 1]) < prompt.instructions.indexOf(text))));
    ok(prompt.instructions.includes("Timing constraints are strict production limits") && prompt.instructions.includes("200ms from EACH"));
    ok(prompt.instructions.includes("dialogue AND narration together") && prompt.instructions.includes("A scene may contain no dialogue"));
    equal(prompt.correction, undefined);
    for (const pace of ["slow", "natural", "energetic"] as const) {
      const d = document(seconds, pace); equal(validateStoryboard(d, storyboardBinding(savedInput)), d);
      equal(inspectPreparedStoryboard(d, savedInput).report.valid, true);
      for (const [i, scene] of plan.scenes.entries()) {
        if (i) equal(scene.startMs, plan.scenes[i - 1].endMs);
        equal(scene.actionAndCamera.endMs, scene.speakingWindow.startMs);
        equal(scene.speakingWindow.endMs, scene.reaction.startMs); equal(scene.reaction.endMs, scene.transition.startMs); equal(scene.transition.endMs, scene.endMs);
        ok(scene.actionAndCamera.durationMs >= 700);
        const limit = scene.limitsByPace[pace];
        ok(limit.preferredTargetWords <= limit.maximumWords && limit.preferredTargetNonspaceCharacters <= limit.maximumNonspaceCharacters);
        equal(limit.availableSpeechMs + limit.pauseReserveMs, limit.durationMs);
      }
      equal(plan.limitsByPace[pace].maximumSpokenWords, plan.scenes.reduce((sum, s) => sum + s.limitsByPace[pace].maximumWords, 0));
    }
  }
  for (const duration of [700, 1100, 1900, 2000, 2100, 2900]) for (const pace of ["slow", "natural", "energetic"] as const) {
    const budget = speechIntervalBudget(1000, 1000 + duration, pace);
    equal(budget.maximumWords, Math.floor(duration / 1000 * speechRates[pace]));
    equal(budget.preferredTargetWords, Math.min(budget.maximumWords <= 1 ? budget.maximumWords : Math.floor(budget.maximumWords * 0.75), Math.floor((duration - 200) / 1000 * speechRates[pace])));
    const d = document(5, pace); const speech = d.scenes[0].speech[0]; speech.startMs = 1000; speech.endMs = 1000 + duration;
    speech.text = Array(budget.maximumWords).fill("a").join(" "); equal(inspectPreparedStoryboard(d, input(5)).report.valid, true);
    speech.text += " a";
    ok(inspectPreparedStoryboard(d, input(5)).report.issues.some(i => i.code === "SPEECH_WORD_BUDGET_EXCEEDED"));
    speech.text = "a".repeat(budget.maximumNonspaceCharacters + 1);
    ok(inspectPreparedStoryboard(d, input(5)).report.issues.some(i => i.code === "SPEECH_CHARACTER_BUDGET_EXCEEDED"));
  }
  const d = document(10, "natural"); d.scenes[0].speech[0] = { ...d.scenes[0].speech[0], startMs: 300, endMs: 2300, text: Array(10).fill("alpha").join(" ") };
  const output = JSON.stringify(d); const report = inspectPreparedStoryboard(output, input(10)).report;
  const correction = storyboardCorrection(output, input(10), new StoryboardValidationError(report));
  equal(correction.mode, "speech_timing_only"); equal(correction.output, output);
  ok("timingFailures" in correction && correction.timingFailures.length === 1);
  if (!("timingFailures" in correction)) throw new Error("MISSING_TIMING_FEEDBACK");
  const failure = correction.timingFailures[0];
  equal(failure.sceneNumber, 1); equal(failure.lineNumber, 1); equal(failure.fieldPath, "$.scenes[0].speech[0]");
  equal(failure.durationMs, 2000); equal(failure.availableSpeechMs, 1800); equal(failure.maximumWords, 4); equal(failure.currentWordCount, 10);
  equal(failure.maximumNonspaceCharacters, 32); equal(failure.currentNonspaceCharacters, 50);
  equal(failure.rules, ["SPEECH_WORD_BUDGET_EXCEEDED", "SPEECH_CHARACTER_BUDGET_EXCEEDED"]);
  const repairedPrompt = storyboardPrompt(input(10), correction);
  equal(repairedPrompt.context.speechTimingPlan.scenes.map(s => [s.startMs, s.endMs]), d.scenes.map(s => [s.startMs, s.endMs]));
  ok(repairedPrompt.correction?.correction.includes("Shorten only affected dialogue/narration"));
  ok(repairedPrompt.correction?.correction.includes("stable voice pace") && repairedPrompt.correction.correction.includes("camera"));
  equal(JSON.stringify(d), output);
  const multiple = document(10, "natural");
  for (const [sceneIndex, start, end, words] of [[0, 300, 2300, 10], [0, 2600, 4700, 7], [1, 5300, 7400, 9], [1, 7700, 9600, 9]]) {
    const scene = multiple.scenes[sceneIndex];
    if (start === 300 || start === 5300) scene.speech = [];
    scene.speech.push({ ...d.scenes[0].speech[0], startMs: start, endMs: end, text: Array(words).fill("word").join(" ") });
  }
  const multipleReport = inspectPreparedStoryboard(multiple, input(10)).report;
  equal(multipleReport.issues.length, 7);
  const multipleCorrection = storyboardCorrection(JSON.stringify(multiple), input(10), new StoryboardValidationError(multipleReport));
  ok("timingFailures" in multipleCorrection);
  if (!("timingFailures" in multipleCorrection)) throw new Error("MISSING_MULTILINE_FEEDBACK");
  equal(multipleCorrection.timingFailures.map(f => [f.sceneNumber, f.lineNumber, f.durationMs, f.maximumWords, f.currentWordCount]),
    [[1, 1, 2000, 4, 10], [1, 2, 2100, 4, 7], [2, 1, 2100, 4, 9], [2, 2, 1900, 4, 9]]);
  equal(multipleCorrection.timingFailures[1].rules, ["SPEECH_WORD_BUDGET_EXCEEDED"]);
  equal(multipleCorrection.timingFailures[3].preferredTargetWords, 3);
  const charOnly = structuredClone(d); charOnly.scenes[0].speech[0].text = "a".repeat(100);
  const charReport = inspectPreparedStoryboard(charOnly, input(10)).report;
  equal(charReport.issues.map(i => i.code), ["SPEECH_CHARACTER_BUDGET_EXCEEDED"]);
  equal(storyboardCorrection(JSON.stringify(charOnly), input(10), new StoryboardValidationError(charReport)).mode, "speech_timing_only");
  // Correction uses ACTUAL returned scene durations, even if a model selected a
  // different valid structure than the initial scaffold. No forced scene cuts.
  const uneven = document(10, "natural"); uneven.scenes[0].endMs = 4000; uneven.scenes[0].speech[0] = { ...d.scenes[0].speech[0] };
  uneven.scenes[1].startMs = 4000; uneven.scenes[1].actions[0].startMs = 4000;
  const unevenReport = inspectPreparedStoryboard(uneven, input(10)).report;
  const unevenCorrection = storyboardCorrection(JSON.stringify(uneven), input(10), new StoryboardValidationError(unevenReport));
  equal(unevenCorrection.mode, "speech_timing_only");
  equal(storyboardPrompt(input(10), unevenCorrection).context.speechTimingPlan.scenes.map(s => s.durationMs), [4000, 6000]);
  const mixed = structuredClone(d); mixed.scenes[0].startMs = 1;
  equal(storyboardCorrection(JSON.stringify(mixed), input(10), new StoryboardValidationError(inspectPreparedStoryboard(mixed, input(10)).report)).mode, "timing_only");
  equal(storyboardCorrection("{malformed", input(10), new Error("PRIVATE_EXCEPTION")).issue, "STORYBOARD_STRUCTURE_INVALID");
  const silent = document(5, "natural"); silent.scenes[0].speech = [];
  equal(inspectPreparedStoryboard(silent, input(5)).report.valid, true);
  equal(speechIntervalBudget(0, 100, "natural").preferredTargetWords, 0);
  equal(speechIntervalBudget(1000, 1000, "natural").preferredTargetWords, 0);
  const shortScenePlan = storyboardSpeechPlan(5000, [{ number: 1, startMs: 0, endMs: 700 }, { number: 2, startMs: 700, endMs: 5000 }]);
  equal(shortScenePlan.scenes[0].actionAndCamera.durationMs, 700);
  equal(shortScenePlan.scenes[0].limitsByPace.natural.availableSpeechMs, 0);
  equal(shortScenePlan.scenes[0].limitsByPace.natural.preferredTargetWords, 0);
  const zeroInterval = document(5, "natural"); zeroInterval.scenes[0].speech[0].endMs = zeroInterval.scenes[0].speech[0].startMs;
  ok(inspectPreparedStoryboard(zeroInterval, input(5)).report.issues.some(i => i.code === "SPEECH_INTERVAL_INVALID"));
  equal(storyboardSpeechPlan(30000, [{ number: 1, startMs: 0, endMs: 30000 }]).limitsByPace.natural.maximumSpokenWords, 41);
  for (const ms of [0, 1000, 15000, 60000]) { assert.throws(() => storyboardSpeechPlan(ms)); checks++; }
  assert.throws(() => storyboardSpeechPlan(10000, [{ number: 1, startMs: 1, endMs: 10000 }])); checks++;
  const provider = readFileSync("lib/storyboard/provider.ts", "utf8"); const worker = readFileSync("lib/storyboard/worker.ts", "utf8");
  ok(provider.includes("storyboardPrompt(input, repair)") && provider.includes("JSON.stringify(prompt.context)") && provider.includes("JSON.stringify(prompt.correction)"));
  equal((provider.match(/client\.responses\.create\(/g) ?? []).length, 1); ok(provider.includes("maxRetries: 0"));
  equal(storyboardMaxRequests, 2); ok(worker.includes("index < storyboardMaxRequests") && worker.includes("index === 1"));
  ok(worker.includes("repair = storyboardCorrection(request.output, row.input, error)"));
  const recoveryBranch = worker.slice(worker.indexOf("if (recovering) {"), worker.indexOf("// Re-read all persisted receipts"));
  ok(!/requestStoryboard\(|storyboardCorrection\(|storyboardConfig\(/.test(recoveryBranch));
  equal(networkCalls, 0);
  console.info(JSON.stringify({ checks, durationsSeconds: [5, 10, 30], providerCalls: 0, workers: 0, databaseCalls: 0, liveWrites: 0 }));
} finally { globalThis.fetch = originalFetch; }
