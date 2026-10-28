// Offline pure profile/preflight checks only. Never loads private configuration.
import assert from "node:assert/strict";
import { checkComposition, compositionProfile, type CompositionRequirements } from "../lib/final-video-generation/composition";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalProviders } from "../lib/final-video-generation/adapters/registry";
import { finalConfiguration } from "../lib/final-video-generation/config";
import { buildVideoGenerationPackage } from "../lib/video-generation-package/builder";
import { canonicalInput as input, input as legacyInput, id } from "./final-video-fixture";

globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_TRANSITION_CHECKS"); };
let checks = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (value: unknown) => { assert.ok(value); checks++; };
const base: CompositionRequirements = { totalDurationMs: 10000, scenes: [0, 1].map(i => ({ id: `scene-${i + 1}`, number: i + 1,
  startMs: i * 5000, endMs: (i + 1) * 5000, durationMs: 5000, transition: "Cut", audio: { background: "None", effects: "None", music: "None" }, speech: [] })) };
equal(checkComposition(base).issues, []); equal(checkComposition(base).plan?.totalDurationMs, 10000);
for (const name of ["Cut", "Hard cut.", "Straight cut", "None", "Cut to the next shot."]) {
  const doc = structuredClone(base); doc.scenes[0].transition = name; equal(checkComposition(doc).plan?.scenes[0].transition.type, "cut");
}
for (const name of ["Fade out over 400ms.", "Fade out cleanly over 0.4 seconds.", "Fade 400ms", "fade_out (400ms)", "Fade in from black for 400ms"]) {
  const doc = structuredClone(base); doc.scenes[1].transition = name; equal(checkComposition(doc).issues, []);
  equal(checkComposition(doc).plan?.scenes[1].transition.durationMs, 400); equal(checkComposition(doc).plan?.totalDurationMs, 10000);
}
for (const name of ["Dissolve into the next shot.", "Fade out cleanly.", "crossfade", "fade"]) {
  const doc = structuredClone(base); doc.scenes[0].transition = name;
  const issue = checkComposition(doc).issues.find(i => i.code === "COMPOSITION_TRANSITION_DURATION_REQUIRED");
  equal(issue?.layer, "composition"); equal(issue?.requestedTransition, name); equal(issue?.sceneNumber, 1); ok(issue?.supportedTransitions?.length);
}
for (const name of ["whip-pan", "Cut with a whip pan", "fade through a magical portal", "xfade;movie=/private/input"]) {
  const doc = structuredClone(base); doc.scenes[0].transition = name;
  const issue = checkComposition(doc).issues.find(i => i.code === "COMPOSITION_TRANSITION_UNSUPPORTED"); ok(issue?.message.includes(JSON.stringify(name))); equal(issue?.layer, "composition");
}
for (const name of ["Dissolve into the next shot over 400ms", "Crossfade over 1s", "dissolve (400ms)"]) {
  const doc = structuredClone(base); doc.scenes[0].transition = name;
  ok(checkComposition(doc).issues.some(i => i.code === "COMPOSITION_TRANSITION_TIMING_MISMATCH")); equal(checkComposition(doc).plan, null);
}
const overlap = structuredClone(base); overlap.scenes[0].durationMs = 6000; overlap.scenes[0].endMs = 6000;
for (const name of ["crossfade over 1s", "dissolve into the next shot over 1000ms"]) {
  overlap.scenes[0].transition = name; equal(checkComposition(overlap).issues, []); equal(checkComposition(overlap).plan?.totalDurationMs, 10000);
}
for (const durationMs of [0, -1, 41, 5000, 6000, NaN, Infinity]) {
  const doc = structuredClone(overlap); doc.scenes[0].transition = { type: "crossfade", durationMs };
  ok(checkComposition(doc).issues.some(i => i.code === "COMPOSITION_TRANSITION_DURATION_INVALID"));
}
const gap = structuredClone(base); gap.scenes[1].startMs += 40; gap.scenes[1].durationMs -= 40; ok(checkComposition(gap).issues.length);
const wrongOrder = structuredClone(base); wrongOrder.scenes = [...wrongOrder.scenes].reverse(); ok(checkComposition(wrongOrder).issues.some(i => i.code === "COMPOSITION_SCENE_ORDER_INVALID"));
const wrongTotal = structuredClone(overlap); wrongTotal.totalDurationMs = 11000; ok(checkComposition(wrongTotal).issues.some(i => i.code === "COMPOSITION_FINAL_TIMING_MISMATCH"));
const sound = structuredClone(base); sound.scenes[0].audio.music = "Required music"; ok(checkComposition(sound).issues.some(i => i.code === "AUDIO_ASSET_REQUIRED" && i.layer === "composition"));

const keys = ["UGC_FINAL_VIDEO_ENABLED", "UGC_FINAL_OPERATOR_FUNDED", "SCEENYK_LOCAL_JOBS_ONLY", "UGC_FINAL_AUTHORIZATION"];
const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
try {
  Object.assign(process.env, { UGC_FINAL_VIDEO_ENABLED: "1", UGC_FINAL_OPERATOR_FUNDED: "1", SCEENYK_LOCAL_JOBS_ONLY: "1",
    UGC_FINAL_AUTHORIZATION: JSON.stringify({ authorizationId: id(80), language: "en", maxRequests: 8, maxEstimatedCostMicrousd: 7000000,
      ceilings: { video: 1000000, voice: 100000, design: 100000, binding: 100000, lip_sync: 1000000 } }) });
  const cfg = finalConfiguration().value; equal(cfg.composition, compositionProfile);
  const source = structuredClone(legacyInput); source.storyboard.document.scenes[0].transition = "Dissolve into the next shot.";
  const doc = buildVideoGenerationPackage(source, 1), snapshot = structuredClone(doc), providers = finalProviders();
  const result = finalPreflight(doc, cfg, providers);
  equal(result.layers.video, []); equal(result.layers.lip_sync, []); ok(result.layers.voice.some(i => i.code === "VOICE_DELIVERY_UNSUPPORTED"));
  ok(result.layers.composition.some(i => i.requestedTransition === "Dissolve into the next shot."));
  const payload = providers.video.prepareScene(doc, doc.scenes[0], new Map(["character", "product", "location"].map(r => [r, `https://invalid.example/${r}`])));
  ok(!payload.prompt.includes('"transition":')); ok(!payload.prompt.includes("Dissolve into the next shot."));
  ok(payload.prompt.includes('"actions":')); ok(payload.prompt.includes('"camera":')); equal(doc, snapshot);
  equal(finalPreflight(doc, { ...cfg, maxRequests: 1 }, providers).layers.funding[0]?.code, "EXECUTION_BUDGET_INSUFFICIENT");
  const fadeSource = structuredClone(input); fadeSource.storyboard.document.scenes[1].transition = { type: "fade_out", durationMs: 400 };
  const fadeDoc = buildVideoGenerationPackage(fadeSource, 1); equal(finalPreflight(fadeDoc, cfg, providers).issues, []);
  equal(fadeDoc.timeline.totalDurationMs, 10000);
} finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
console.info(`M10 transition/profile/preflight checks passed: ${checks}; worker/provider/RPC execution: none`);
