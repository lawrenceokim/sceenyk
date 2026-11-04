import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { storyboardDirectorInput, storyboardDirectorInstructions, STORYBOARD_DIRECTOR_VERSION, STORYBOARD_PROMPT_COMPILER_VERSION, validateDirectedStoryboard } from "../lib/final-video-generation-v3/storyboard-director";
import { OpenAICreativeDirectorProvider } from "../lib/final-video-generation-v3/adapters/openai";
import { compileDirectorInstructions } from "../lib/final-video-generation-v3/compiler";
import { buildFrozenPackage, readFrozenPackage, restoreSegment } from "../lib/final-video-generation-v3/package";
import { planGenerationSegments } from "../lib/final-video-generation-v3/planner";
import { generationContext } from "../lib/final-video-generation-v3/generation-context";
import { v3Input, v3Provider, v3Context, sealV3, v3Id } from "./final-video-v3-fixture";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (a: unknown) => { assert.ok(a); checks++; };
const fails = (fn: () => unknown, code?: string) => { if (code) assert.throws(fn, new RegExp(code)); else assert.throws(fn); checks++; };
const brief: Parameters<typeof storyboardDirectorInput>[0] = { id: v3Id(2), title: "A purposeful reveal", prompt: "A quiet reveal. No dialogue; use tactile sound and a warm reaction.",
  aspect_ratio: "9:16", duration: "10", visual_style: "Realistic", tone: "Professional", category: "storytelling", ugc_type: "advertisement", creation_type: "ugc", video_resolution: "480p" };
const location = { instruction: { name: "Studio", prompt: "An empty studio with a broad working surface." }, sheetHash: "a".repeat(64) };
const provider = new OpenAICreativeDirectorProvider({ model: "fixture-director", maxOutputTokens: 14000 });
for (const [category, type] of [["product-ad", "advertisement"], ["cinematic", "advertisement"], ["gaming", "advertisement"], ["storytelling", "explanation"], ["social", "unboxing"]] as const) {
  for (const duration of ["5", "10", "30"] as const) for (const style of ["Original", "Cinematic", "Anime", "Cartoon", "Realistic"] as const) for (const creation of ["ugc", "freestyle"] as const) {
    const prompt = category === "gaming" ? "A legible escape and a joyful win; energetic English narration." : category === "cinematic" ? "A silent discovery with dramatic lighting and an emotional payoff." : type === "explanation" ? "Explain one idea slowly; speak only the words 'Watch this unfold'." : type === "unboxing" ? "Unbox the approved object, keep left-hand handling continuous, no spoken words." : brief.prompt;
    const saved: typeof brief = { ...brief, prompt, category, ugc_type: type, duration, visual_style: style, creation_type: creation,
      aspect_ratio: category === "gaming" ? "16:9" : type === "unboxing" ? "1:1" : "9:16", tone: category === "cinematic" ? "Dramatic" : category === "gaming" ? "Energetic" : "Professional" };
    const instruction = storyboardDirectorInput(saved, ["character", "product", "location"], location);
    const request = provider.prepareStoryboard({ instruction, durationMs: Number(duration) * 1000, referenceUrls: ["https://example.invalid/character.png", "https://example.invalid/product.png", "https://example.invalid/location.png"] });
    const body = JSON.stringify(request.body);
    for (const value of [saved.prompt, style, type, category, creation, `${Number(duration) * 1000}`, location.instruction.prompt, "1: character Sheet; 2: product Sheet; 3: location Sheet"]) ok(body.includes(value));
    equal(request.body.instructions, storyboardDirectorInstructions);
    equal(request.body.store, false);
    ok(body.includes(saved.aspect_ratio)); ok(body.includes(saved.tone));
  }
}
ok(storyboardDirectorInput(brief, ["character", "location"], null).includes("No Product reference"));
fails(() => storyboardDirectorInput(brief, ["character", "character"], null), "V3_REFERENCES_REQUIRED");
fails(() => storyboardDirectorInput({ ...brief, duration: "7" } as unknown as typeof brief, ["character", "location"], null));
fails(() => storyboardDirectorInput({ ...brief, aspect_ratio: "2:1" } as unknown as typeof brief, ["character", "location"], null));
for (const word of ["no fixed count", "beginning", "unboxing", "gaming", "emotional", "left/right hand", "before composing", "silence", "2.3 words/sec"]) ok(storyboardDirectorInstructions.includes(word));

for (const durations of [[5000], [2000, 3000], [10000], [3000, 2000, 5000], [30000], [4000, 7000, 9000, 10000]]) {
  const input = v3Input(durations), storyboard = input.storyboardContent;
  equal(validateDirectedStoryboard(storyboard, storyboard), storyboard);
  input.direction = JSON.stringify({ ...generationContext(brief), promptCompiler: STORYBOARD_DIRECTOR_VERSION, approvedLocation: location });
  sealV3(input);
  const planned = planGenerationSegments(input, v3Provider(), v3Context(input));
  ok(planned.ok);
  if (planned.ok) { equal(planned.plan.segments.length, 1); equal(planned.plan.segments[0].durationMs, storyboard.durationMs); }
}
const valid = v3Input([5000, 5000]).storyboardContent;
for (const [mutate, code] of [
  [(s: typeof valid) => { s.scenes[1].startMs += 1000; }, "TIMING"],
  [(s: typeof valid) => { s.scenes[1].endMs -= 1000; }, "TIMING"],
  [(s: typeof valid) => { s.scenes[1].id = s.scenes[0].id; }, "ORDER"],
  [(s: typeof valid) => { s.scenes[1].number = 1; }, "ORDER"],
  [(s: typeof valid) => { s.scenes[0].actions[0].endMs = 6000; }, "ACTION_TIMING"],
  [(s: typeof valid) => { s.scenes[0].transition = { type: "crossfade", durationMs: 300 }; }, "TRANSITION"],
  [(s: typeof valid) => { s.scenes[0].transition = { type: "cut", durationMs: 300 }; }, "TRANSITION"],
  [(s: typeof valid) => { s.visualStyle = "Anime"; }, "STYLE"],
  [(s: typeof valid) => { s.aspectRatio = "1:1"; }, "TIMING"],
  [(s: typeof valid) => { s.scenes[0].audio.effects.assetId = v3Id(999); }, "AUDIO_BINDING"],
] as const) {
  const changed = structuredClone(valid); mutate(changed); fails(() => validateDirectedStoryboard(changed, valid), code);
}
const speech = { startMs: 1000, endMs: 3000, speaker: "character" as const, text: "Look at this.",
  delivery: { pace: "natural" as const, energy: "balanced" as const, tone: "warm" as const, emphasis: "light" as const, style: "conversational" as const }, deliveryNote: "Soft wonder, then a breath." };
const speaking = structuredClone(valid); speaking.scenes[0].speech = [speech];
equal(validateDirectedStoryboard(speaking, valid), speaking);
for (const lines of [[{ ...speech, endMs: 500 }], [{ ...speech, startMs: 4000, endMs: 6000 }], [speech, { ...speech, startMs: 2000, endMs: 4000 }], [{ ...speech, text: "This line contains far too many words for the tiny available window to be spoken naturally." }], [{ ...speech, text: "x".repeat(33) }]]) {
  const changed = structuredClone(speaking); changed.scenes[0].speech = lines;
  fails(() => validateDirectedStoryboard(changed, valid), "SPEECH_TIMING");
}

const input = v3Input(); input.storyboardContent = speaking;
input.storyboardContent.scenes[0].transitionNote = "Match the left-hand grip across the cut.";
input.storyboardContent.scenes[1].generationNotes = "Continue the same lift; cup stays in the left hand.";
input.direction = JSON.stringify({ promptCompiler: STORYBOARD_DIRECTOR_VERSION, instructions: "OUTDATED_SOURCE_TEXT", approvedLocation: location });
sealV3(input);
const before = structuredClone(input), compiled = compileDirectorInstructions(input, 0, 2);
equal(input, before); equal(compiled.scenes, speaking.scenes); equal(compiled.dialogue.map(d => d.text), [speech.text]);
for (const text of ["0–5s: Shot 1", "5–10s: Shot 2", '"Look at this."', "1–3s", speech.deliveryNote, "pace: natural", "emphasis: light", "Match the left-hand grip", "Continue the same lift", "native audio", "9:16", "Realistic", "Blue jacket", "Camera:", "Lighting:", "Audio background (optional)"]) ok(compiled.prompt.includes(text));
for (const value of ["OUTDATED_SOURCE_TEXT", "sheetHash", "approvedLocation", input.references[0].sha256, input.references[0].id]) ok(!compiled.prompt.includes(value));
const packageDoc = buildFrozenPackage(input, v3Provider(), v3Context(input), { id: input.package.id, version: 1, sourceRevision: 1 });
equal(readFrozenPackage(packageDoc), packageDoc);
equal(restoreSegment(packageDoc, packageDoc.segments[0].id).command.direction.prompt, compiled.prompt);
const later = compileDirectorInstructions(input, 1, 2);
ok(later.prompt.includes("0–5s: Shot 2")); ok(!later.prompt.includes("Look at this."));

// Golden prompt digest captured from the pre-change compiler and fixture. Keep
// this independent of Git HEAD so the compatibility check survives commits.
const legacyPromptHash = "0411ed1a158feec05995c1437e98dc494f1ae69c83ccc84c711a56c1e5a6514a";
const promptHash = (value: string) => createHash("sha256").update(value).digest("hex");
const historical = v3Input();
equal(promptHash(compileDirectorInstructions(historical, 0, 2).prompt), legacyPromptHash);
const historicalDoc = buildFrozenPackage(historical, v3Provider(), v3Context(historical), { id: historical.package.id, version: 1, sourceRevision: 1 });
equal(promptHash(historicalDoc.segments[0].compiledPrompt), legacyPromptHash);
equal(readFrozenPackage(historicalDoc), historicalDoc);

// Freeze the earlier approved-Storyboard recipe as well as the unmarked one.
const approvedV1 = v3Input();
approvedV1.direction = JSON.stringify({ promptCompiler: "approved-storyboard-v1", instructions: "OUTDATED_SOURCE_TEXT", approvedLocation: location });
sealV3(approvedV1);
equal(promptHash(compileDirectorInstructions(approvedV1, 0, 2).prompt), "3c244ad8ec9ff957a5bbcd737bcddfd735dede297bc511dae8c690b5673f8fdc");
const approvedV1Package = buildFrozenPackage(approvedV1, v3Provider(), v3Context(approvedV1), { id: approvedV1.package.id, version: 1, sourceRevision: 1 });
equal(approvedV1Package.hash, "e50c53605d47b3602f81afb2fbea1c1ccea912a66d2ced5185b14d2c241cb47b");
equal(readFrozenPackage(approvedV1Package), approvedV1Package);
equal(restoreSegment(approvedV1Package, approvedV1Package.segments[0].id).command.direction.prompt, approvedV1Package.segments[0].compiledPrompt);

// The actual adapter receives distinct directing emphasis, exact style controls
// and verbatim prohibitions, without interpreting natural-language preferences.
const typeInputs = ["advertisement", "explanation", "unboxing"].map(ugc_type => storyboardDirectorInput({ ...brief, ugc_type } as typeof brief, ["character", "product", "location"], location));
equal(new Set(typeInputs).size, 3);
ok(typeInputs[0].includes("evidenced benefit")); ok(typeInputs[1].includes("ordered visible evidence")); ok(typeInputs[2].includes("preserving packaging state"));
ok(storyboardDirectorInput({ ...brief, creation_type: "freestyle", category: "gaming" }, ["character", "location"], location).includes("spatial goals"));
ok(storyboardDirectorInput({ ...brief, creation_type: "freestyle" }, ["character", "location"], location).includes("rather than defaulting to a presenter advertisement"));
for (const text of ["USER PREFERENCES GOVERN", "speech must be []", "Narration-only", "character-dialogue-only", "requirement none and an empty description", "same cue description", "visible cause", "one legible main action", "frame-perfect", "no requirement for equal or unequal", "unsupported branding", "not photorealistic footage with an Anime label"]) ok(storyboardDirectorInstructions.includes(text));

const count = (value: string, text: string) => value.split(text).length - 1;
const refined = v3Input(Array(6).fill(5000));
const userIntent = "Keep the approved quiet demonstration; no music, narration only, no sales slogan or dramatic camera move.";
refined.direction = JSON.stringify({ ...generationContext(brief), instructions: userIntent, promptCompiler: STORYBOARD_PROMPT_COMPILER_VERSION, approvedLocation: location });
refined.storyboardContent.voiceIntent = "One calm off-screen narrator; the Character never speaks.";
const ambience = "One coherent room ambience from the approved studio: a restrained, steady interior bed that stays quiet and leaves room for the narration without an artificial swell or fresh restart at a cut.";
for (const shot of refined.storyboardContent.scenes) {
  shot.audio.background = { requirement: "optional", description: ambience, assetId: null };
  shot.audio.music = { requirement: "none", description: "", assetId: null };
  shot.audio.effects = { requirement: "optional", description: "A single soft ceramic tap as the cup touches the table.", assetId: null };
  shot.purpose = `Approved beat ${shot.number}: a restrained reveal with a natural reaction.`;
  shot.camera.movement = "Locked camera; no movement.";
  shot.transitionNote = `Continue the left-hand grip through boundary ${shot.number}.`;
  shot.generationNotes = `The handle remains screen-right in shot ${shot.number}; do not reset the lift.`;
}
refined.storyboardContent.scenes[0].speech = [{ ...speech, speaker: "narration", text: 'A quiet "moment".', deliveryNote: "Leave a breath; no visible mouth movement." }];
sealV3(refined);
const refinedBefore = structuredClone(refined), r = compileDirectorInstructions(refined, 0, 6);
equal(refined, refinedBefore); equal(r.scenes, refined.storyboardContent.scenes);
equal(r.dialogue.map(line => line.text), ['A quiet "moment".']);
equal(count(r.prompt, userIntent), 1); equal(count(r.prompt, ambience), 1);
equal(count(r.prompt, "A single soft ceramic tap as the cup touches the table."), 6);
equal(count(r.prompt, "Music (none)"), 1);
for (const text of ["30s", "9:16", "Off-screen narration", '"A quiet \\"moment\\"."', "frame-perfect execution is not guaranteed", "one continuous"]) {
  ok(r.prompt.toLowerCase().includes(text.toLowerCase()));
}
for (const value of [refined.storyboardContent.concept, refined.storyboardContent.visualStyle, refined.storyboardContent.tone, refined.storyboardContent.voiceIntent, ...Object.values(refined.storyboardContent.continuity)]) ok(r.prompt.includes(value));
for (const shot of refined.storyboardContent.scenes) {
  for (const value of [shot.purpose, shot.description, shot.productInteraction, shot.productPosition, ...Object.values(shot.camera), ...Object.values(shot.lighting), shot.transitionNote, shot.generationNotes,
    ...shot.actions.flatMap(action => [action.movement, action.gesture, action.expression]), ...shot.speech.flatMap(line => [line.deliveryNote, ...Object.values(line.delivery)])]) if (value) ok(r.prompt.includes(value));
  ok(r.prompt.includes(`${shot.startMs / 1000}–${shot.endMs / 1000}s | Shot ${shot.number}`));
}
for (const value of ["sheetHash", "approvedLocation", "storageKey", refined.references[0].sha256, refined.references[0].id]) ok(!r.prompt.includes(value));
const previousRecipe = structuredClone(refined); previousRecipe.direction = JSON.stringify({ ...JSON.parse(refined.direction), promptCompiler: STORYBOARD_DIRECTOR_VERSION });
ok(r.prompt.length < compileDirectorInstructions(previousRecipe, 0, 6).prompt.length);
const refinedPlan = planGenerationSegments(refined, v3Provider(), v3Context(refined));
ok(refinedPlan.ok); if (refinedPlan.ok) { equal(refinedPlan.plan.segments.length, 1); equal(refinedPlan.plan.segments[0].durationMs, 30000); }
const refinedPackage = buildFrozenPackage(refined, v3Provider(), v3Context(refined), { id: refined.package.id, version: 1, sourceRevision: 1 });
equal(readFrozenPackage(refinedPackage), refinedPackage);
equal(restoreSegment(refinedPackage, refinedPackage.segments[0].id).command.direction.prompt, r.prompt);

// A purposeful sound change must never be merged into the preceding cue.
const change = structuredClone(refined);
change.storyboardContent.scenes[5].audio.background = { requirement: "required", description: "The room goes quiet for the final held image.", assetId: null };
const changedPrompt = compileDirectorInstructions(change, 0, 6).prompt;
ok(!changedPrompt.includes(`Throughout this video — Ambience`));
equal(count(changedPrompt, ambience), 5); equal(count(changedPrompt, "The room goes quiet for the final held image."), 1);
ok(changedPrompt.includes("Ambience (required)"));
const bound = structuredClone(refined);
bound.references.push({ ...bound.references[0], id: v3Id(444), kind: "audio", role: "sound", name: "Approved room bed", mimeType: "audio/wav", durationMs: 30000 });
bound.storyboardContent.scenes[5].audio.background.assetId = v3Id(444);
ok(compileDirectorInstructions(bound, 0, 6).prompt.includes("reference 4: Approved room bed"));
const partial = compileDirectorInstructions(refined, 2, 4);
ok(partial.prompt.includes("0–5s | Shot 3")); ok(partial.prompt.includes("Transition for later joining"));
equal(partial.scenes, refined.storyboardContent.scenes.slice(2, 4));

// Approved silence and style survive compilation without a creative rewrite.
for (const style of ["Original", "Cinematic", "Anime", "Cartoon", "Realistic"]) for (const durations of [[5000], [2000, 3000], [4000, 6000], [8000, 7000, 15000]]) {
  const silent = v3Input(durations); silent.storyboardContent.visualStyle = style;
  silent.storyboardContent.voiceIntent = "No speech, music or sound effects.";
  silent.direction = JSON.stringify({ promptCompiler: STORYBOARD_PROMPT_COMPILER_VERSION, instructions: "Silent performance. No speech, no music, no effects.", visualStyle: style });
  for (const shot of silent.storyboardContent.scenes) for (const role of ["background", "effects", "music"] as const) shot.audio[role] = { requirement: "none", description: "", assetId: null };
  const silentBefore = structuredClone(silent), result = compileDirectorInstructions(silent, 0, silent.storyboardContent.scenes.length);
  equal(silent, silentBefore); equal(result.scenes, silent.storyboardContent.scenes); equal(result.dialogue, []);
  ok(result.prompt.includes(`Visual style throughout: ${style}`)); ok(result.prompt.includes("No spoken words."));
  for (const role of ["Ambience", "Effects", "Music"]) equal(count(result.prompt, `${role} (none)`), 1);
  ok(!result.prompt.includes("Character dialogue ")); ok(!result.prompt.includes("Off-screen narration "));
}
equal(networkCalls, 0);
console.log(`${checks} V3 Storyboard Director/compiler checks passed; zero network requests. Synthetic outputs verify contracts and prompt coverage, not model creative quality.`);
