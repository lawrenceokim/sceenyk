// Offline foundations only: no env loading, DB/storage, media or provider requests.
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildVideoGenerationPackage, packageDigest } from "../lib/video-generation-package/builder";
import { canonicalInput, fixturePricingRaw, id } from "./final-video-fixture";
import { finalProviders, adapterIdentities } from "../lib/final-video-generation/adapters/registry";
import { finalPricing } from "../lib/final-video-generation/adapters/pricing";
import { compositionProfile } from "../lib/final-video-generation/composition";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import type { FinalConfiguration } from "../lib/final-video-generation/contract";
import { SeedanceSegmentPlanningProvider } from "../lib/final-video-generation-v2/adapters/seedance";
import { planGenerationSegments } from "../lib/final-video-generation-v2/planner";
import { segmentInputFromPackage } from "../lib/final-video-generation-v2/package-input";
import { segmentPlanVersion, type SegmentPlanningInput, type GenerationSegmentPlan } from "../lib/final-video-generation-v2/contract";
import type { SegmentCapabilities, VideoGenerationPlanningProvider } from "../lib/final-video-generation-v2/capabilities";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN_IN_V2_FOUNDATION_CHECKS"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (a: unknown) => { assert.ok(a); checks++; };
const seedance = new SeedanceSegmentPlanningProvider();
const doc = buildVideoGenerationPackage(canonicalInput, 1);
const savedPackage = structuredClone(doc), savedStoryboard = structuredClone(canonicalInput.storyboard);
const packageApproval = { id: id(90), version: 1, approvedAt: "2026-10-29T12:00:00+01:00" };
const provider = (mutate?: (cap: SegmentCapabilities) => void): VideoGenerationPlanningProvider => {
  const cap = seedance.getCapabilities();
  cap.providerId = "synthetic-video-provider"; cap.adapterVersion = "synthetic-v2"; cap.contractVersion = "synthetic-reviewed-v2";
  cap.supportsSpeechAudioDrivenLipSynchronization = "supported";
  cap.supportsExactShotTiming = "supported"; cap.supportsExactAudioPreservation = "supported";
  mutate?.(cap);
  return { version: segmentPlanVersion, getCapabilities: () => structuredClone(cap),
    validateRequirements: () => [], estimateCost: input => seedance.estimateCost(input) };
};
const supported = provider();
function inputFor(durations: number[]): SegmentPlanningInput {
  const input = segmentInputFromPackage(doc, { packageApproval, resolution: "720p", audioReference: null });
  input.durationMs = durations.reduce((sum, duration) => sum + duration, 0);
  let start = 0;
  input.scenes = durations.map((duration, index) => {
    const scene = structuredClone(input.scenes[0]);
    scene.id = `scene-${index + 1}`; scene.number = index + 1; scene.startMs = start;
    scene.endMs = start + duration; scene.durationMs = duration;
    scene.actions = [{ ...scene.actions[0], startMs: start, endMs: start + Math.min(1000, duration) }];
    scene.speech = []; scene.transition = { type: "cut", durationMs: 0 };
    start += duration; return scene;
  });
  input.audioReference = { timelineId: "approved-master-intent", version: 1, timingFingerprint: "a".repeat(64),
    durationMs: input.durationMs, mimeType: "audio/wav", expectedSliceSizeBytes: null, asset: null };
  return input;
}
function speakingInput() {
  const input = inputFor([5000, 5000]), line = doc.scenes[1].speech[0];
  input.scenes[0].speech = [{ ...line, startMs: 1200, endMs: 2600, text: "Approved dialogue one." }];
  input.scenes[1].speech = [{ ...line, startMs: 6200, endMs: 7600, text: "Approved dialogue two." }];
  return input;
}
function plan(input: SegmentPlanningInput, adapter = supported): GenerationSegmentPlan {
  const result = planGenerationSegments(input, adapter);
  assert.ok(result.ok, JSON.stringify(result.ok ? [] : result.issues)); checks++;
  return result.plan;
}
function fails(input: unknown, code: string, adapter = supported) {
  const result = planGenerationSegments(input, adapter);
  assert.ok(!result.ok, `Expected ${code}`); checks++;
  if (!result.ok) ok(result.issues.some(issue => issue.code === code));
}

// One request for supported whole-project intervals, independently of creative scene count.
for (const durations of [[5000], [5000, 5000], [6000, 6000, 6000, 6000, 6000]]) {
  const input = inputFor(durations), before = structuredClone(input), p = plan(input);
  equal(p.segments.length, 1); equal(p.segments[0].durationMs, input.durationMs);
  equal(p.segments[0].includedSceneNumbers, durations.map((_, i) => i + 1)); equal(p.executable, false); equal(input, before);
}
const speaking = speakingInput(), original = structuredClone(speaking), p10 = plan(speaking);
equal(p10.scope, speaking.scope);
equal(p10.segments[0].dialogue.map(d => [d.startMs, d.endMs, d.localStartMs, d.localEndMs]), [[1200, 2600, 1200, 2600], [6200, 7600, 6200, 7600]]);
equal(p10.segments[0].scenes, speaking.scenes);
equal(p10.segments[0].shotChanges[0], { fromSceneNumber: 1, toSceneNumber: 2, atMs: 5000, localAtMs: 5000,
  transition: { type: "cut", durationMs: 0 }, owner: "video" });
equal(p10.segments[0].audioReference?.sliceDurationMs, 10000);
equal(p10.segments[0].audioReference?.asset, null); equal(p10.segments[0].requiredReferences, speaking.references);
const compiled = JSON.parse(p10.segments[0].instructions);
equal(compiled.visualStyle, speaking.visualStyle); equal(compiled.scenes[1].camera, speaking.scenes[1].camera);
equal(compiled.scenes[0].actions, speaking.scenes[0].actions); equal(compiled.scenes[0].lighting, speaking.scenes[0].lighting);
equal(speaking, original);
equal(plan(inputFor([2500, 2500, 2500, 2500])).segments.map(s => s.durationMs), [10000]);

// Long-project planner envelope only: does not expand saved project/package options.
const p60 = plan(inputFor(Array(12).fill(5000)));
equal(p60.segments.map(s => [s.startMs, s.endMs, s.durationMs]), [[0, 30000, 30000], [30000, 60000, 30000]]);
equal(p60.segments.map(s => s.includedSceneNumbers), [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]]);
equal(p60.segments[1].audioReference?.sliceStartMs, 30000);
equal(p60.segments[0].shotChanges.at(-1)?.owner, "composition");
equal(plan(inputFor(Array(7).fill(5000))).segments.map(s => s.durationMs), [30000, 5000]);
const longSpeech = inputFor(Array(12).fill(5000));
longSpeech.scenes[6].speech = [{ ...doc.scenes[1].speech[0], startMs: 31200, endMs: 32600 }];
equal(plan(longSpeech).segments[1].dialogue[0].localStartMs, 1200);
// Greedy 8s would leave an invalid 2s tail; the exact solution is 5s + 5s.
equal(plan(inputFor([5000, 3000, 2000]), provider(c => { c.maxContinuousDurationMs = 8000; c.supportedDurationsMs = [5000, 8000]; })).segments.map(s => s.durationMs), [5000, 5000]);
fails(inputFor([5000]), "DURATION_UNREPRESENTABLE", provider(c => { c.supportedDurationsMs = [4000]; }));
fails(inputFor([5500]), "DURATION_UNREPRESENTABLE");
fails(inputFor([35000]), "SCENE_EXCEEDS_CONTINUOUS_DURATION");
fails(inputFor([5000]), "CAPABILITY_UNSUPPORTED", provider(c => { c.supportsAudioReference = "unsupported"; }));
fails(speaking, "CAPABILITY_UNSUPPORTED", provider(c => { c.supportsNativeLipSynchronization = "unsupported"; }));
// Actual Seedance API: native generated sync != verified supplied-speech master sync.
fails(speaking, "CAPABILITY_UNVERIFIED", seedance);
equal(plan(inputFor([5000, 5000]), seedance).segments.length, 1); // no visible speaking requirement
const noAudio = speakingInput(); noAudio.audioReference = null;
fails(noAudio, "AUDIO_REFERENCE_BINDING_REQUIRED");
const exactCuts = inputFor([5000, 5000]); exactCuts.requiredCapabilities = ["supportsExactShotTiming"];
fails(exactCuts, "CAPABILITY_UNVERIFIED", seedance);
const exactAudio = inputFor([5000]); exactAudio.requiredCapabilities = ["supportsExactAudioPreservation"];
fails(exactAudio, "CAPABILITY_UNVERIFIED", seedance);
const unknown = inputFor([5000]); unknown.requiredCapabilities = ["undocumentedFeature"];
fails(unknown, "UNKNOWN_PROVIDER_REQUIREMENT");
const multi = inputFor([5000, 5000]); multi.requiredCapabilities = ["supportsMultiShotPrompting"];
fails(multi, "CAPABILITY_UNSUPPORTED", provider(c => { c.supportsMultiShotPrompting = "unsupported"; }));
fails(inputFor([5000, 5000]), "CAPABILITY_UNVERIFIED", provider(c => { c.supportsMultiShotPrompting = "unverified"; }));

fails(inputFor([5000]), "REFERENCE_COUNT_EXCEEDED", provider(c => { c.referenceLimits.images.maxCount = 2; }));
fails(inputFor([5000]), "AUDIO_REFERENCE_COUNT_EXCEEDED", provider(c => { c.referenceLimits.audio.maxCount = 0; }));
const tooManyRefs = inputFor([5000]);
tooManyRefs.references.push(...Array.from({ length: 28 }, (_, index) => ({ ...tooManyRefs.references[0], id: id(300 + index) })));
fails(tooManyRefs, "REFERENCE_COUNT_EXCEEDED", seedance);
const noLocation = inputFor([5000]); noLocation.references[2].role = "product";
fails(noLocation, "REFERENCE_ROLE_MISSING");
const duplicate = inputFor([5000]); duplicate.references[1].id = duplicate.references[0].id;
fails(duplicate, "REFERENCE_DUPLICATE");
const bigImage = inputFor([5000]); bigImage.references[0].sizeBytes = 30_000_001;
fails(bigImage, "REFERENCE_SIZE_EXCEEDED", seedance);
const badImage = inputFor([5000]); badImage.references[0].mimeType = "image/avif";
fails(badImage, "REFERENCE_FORMAT_UNSUPPORTED", seedance);
fails(inputFor([5000]), "TOTAL_REFERENCE_COUNT_EXCEEDED", provider(c => { c.referenceLimits.maxTotalFiles = 3; }));
const badRatio = inputFor([5000]); badRatio.aspectRatio = "5:4"; fails(badRatio, "ASPECT_RATIO_UNSUPPORTED");
const badResolution = inputFor([5000]); badResolution.resolution = "4k"; fails(badResolution, "RESOLUTION_UNSUPPORTED");
const badMaster = inputFor([5000]); badMaster.audioReference!.durationMs = 10000; fails(badMaster, "MASTER_DURATION_MISMATCH");
const badAudio = inputFor([5000]); badAudio.audioReference!.mimeType = "audio/ogg"; fails(badAudio, "AUDIO_FORMAT_UNSUPPORTED");
const bigAudio = inputFor([5000]); bigAudio.audioReference!.expectedSliceSizeBytes = 15_000_001; fails(bigAudio, "AUDIO_SIZE_EXCEEDED");
const shortAudio = provider(c => { c.referenceLimits.audio.maxDurationMs = 5000; });
equal(plan(inputFor([5000, 5000]), shortAudio).segments.map(s => s.durationMs), [5000, 5000]);
fails(inputFor([10000]), "AUDIO_DURATION_UNSUPPORTED", shortAudio);
const timing = inputFor([5000, 5000]); timing.scenes[1].startMs = 5100; fails(timing, "SCENE_TIMING_INVALID");
const action = inputFor([5000]); action.scenes[0].actions[0].endMs = 5001; fails(action, "ACTION_TIMING_INVALID");
const speechOverflow = speakingInput(); speechOverflow.scenes[0].speech[0].endMs = 5001; fails(speechOverflow, "DIALOGUE_TIMING_INVALID");
const overlap = speakingInput(); overlap.scenes[0].speech.push({ ...overlap.scenes[0].speech[0], startMs: 1300 }); fails(overlap, "DIALOGUE_OVERLAP");
const wrongTotal = inputFor([5000]); wrongTotal.durationMs = 6000; wrongTotal.audioReference!.durationMs = 6000; fails(wrongTotal, "TOTAL_DURATION_MISMATCH");
const transition = inputFor([5000]); transition.scenes[0].transition = { type: "fade_out", durationMs: 400 }; fails(transition, "TRANSITION_UNSUPPORTED", seedance);
const invalidFade = inputFor([1000, 4000]); invalidFade.scenes[0].transition = { type: "fade_out", durationMs: 1200 };
fails(invalidFade, "TRANSITION_TIMING_INVALID", provider(c => { c.supportedTransitions.push("fade_out"); }));
const requiredSound = inputFor([5000]); requiredSound.scenes[0].audio.music = { requirement: "required", description: "Music", assetId: null }; fails(requiredSound, "REQUIRED_AUDIO_MANIFEST_UNAVAILABLE");
fails(inputFor([5000]), "PROMPT_LIMIT_EXCEEDED", provider(c => { c.maxPromptCharacters = 10; }));
fails({ ...inputFor([5000]), version: "ugc-final-v1" }, "PLANNING_INPUT_INVALID");
fails(inputFor([5000]), "CAPABILITY_SNAPSHOT_INVALID", provider(c => { c.supportedDurationsMs = [31000]; }));
fails({ ...inputFor([5000]), unauthorizedProviderField: true }, "PLANNING_INPUT_INVALID");

// Stable content identities, object-key-order independence and explicit dependency changes.
equal(plan(speaking).fingerprint, p10.fingerprint);
const reorder = (v: unknown): unknown => Array.isArray(v) ? v.map(reorder) : v && typeof v === "object" ?
  Object.fromEntries(Object.entries(v).reverse().map(([key, value]) => [key, reorder(value)])) : v;
const reordered = planGenerationSegments(reorder(speaking), supported);
ok(reordered.ok); if (reordered.ok) equal(reordered.plan.fingerprint, p10.fingerprint);
equal(plan(speaking, provider(c => { c.supportedDurationsMs.reverse(); c.supportedAspectRatios.reverse(); })).fingerprint, p10.fingerprint);
for (const mutate of [
  (v: SegmentPlanningInput) => { v.scenes[0].description += " Updated approved action."; },
  (v: SegmentPlanningInput) => { v.scenes[0].camera.movement = "Pan"; },
  (v: SegmentPlanningInput) => { v.scenes[0].lighting.atmosphere = "Warm"; },
  (v: SegmentPlanningInput) => { v.scenes[0].speech[0].text += " Updated."; },
  (v: SegmentPlanningInput) => { v.audioReference!.version++; },
  (v: SegmentPlanningInput) => { v.audioReference!.timingFingerprint = "b".repeat(64); },
  (v: SegmentPlanningInput) => { v.references[0].sha256 = "c".repeat(64); },
  (v: SegmentPlanningInput) => { v.scope.ownerId = id(800); },
  (v: SegmentPlanningInput) => { v.source.packageApproval.version++; },
]) { const changed = structuredClone(speaking); mutate(changed); ok(plan(changed).fingerprint !== p10.fingerprint); }
const changedProvider = provider(c => { c.providerId = "alternative-provider"; c.adapterVersion = "alternative-v1"; });
ok(plan(speaking, changedProvider).capabilityHash !== p10.capabilityHash);
ok(plan(speaking, changedProvider).segments[0].fingerprint !== p10.segments[0].fingerprint);
equal(plan(inputFor(Array(6).fill(5000)), provider(c => { c.maxContinuousDurationMs = 10000; c.supportedDurationsMs = [5000, 10000]; })).segments.map(s => s.durationMs), [10000, 10000, 10000]);
p10.segments[0].scenes[0].description = "Mutated output copy"; equal(speaking, original);
equal(doc, savedPackage); equal(canonicalInput.storyboard, savedStoryboard);

// Documented token arithmetic, no authorization ceilings and no guessed 1080p shape.
equal(seedance.getCapabilities().supportedDurationsMs, Array.from({ length: 27 }, (_, i) => (i + 4) * 1000));
equal(seedance.getCapabilities().supportedAspectRatios, ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"]);
equal(seedance.getCapabilities().maxPromptCharacters, null);
equal(seedance.estimateCost({ durationMs: 10000, resolution: "720p", aspectRatio: "16:9" }).estimatedCostMicrousd, 4622400);
equal(seedance.estimateCost({ durationMs: 10000, resolution: "480p", aspectRatio: "16:9" }).estimatedCostMicrousd, 2149416);
equal(seedance.estimateCost({ durationMs: 10000, resolution: "720p", aspectRatio: "16:9", referenceVideoDurationsMs: [8000] }).estimatedCostMicrousd, 4992192);
equal(seedance.estimateCost({ durationMs: 10000, resolution: "1080p", aspectRatio: "16:9" }).estimatedCostMicrousd, null);
equal(seedance.estimateCost({ durationMs: 3500, resolution: "720p", aspectRatio: "16:9" }).reason, "DURATION_UNSUPPORTED");
equal(seedance.estimateCost({ durationMs: 10000, resolution: "720p", aspectRatio: "5:4" }).reason, "OUTPUT_DIMENSIONS_UNCONFIRMED");
equal(seedance.estimateCost({ durationMs: 10000, resolution: "720p", aspectRatio: "16:9", referenceVideoDurationsMs: [31000] }).reason, "REFERENCE_VIDEO_DURATION_UNSUPPORTED");
ok(seedance.validateRequirements({ durationMs: 10001, aspectRatio: "16:9", resolution: "720p", imageCount: 3, audioCount: 1, promptCharacters: 100 }).some(i => i.code === "ADAPTER_DURATION_UNSUPPORTED"));
const blockedAdapter: VideoGenerationPlanningProvider = { ...supported, validateRequirements: () => [{ code: "ADAPTER_COMBINATION_UNSUPPORTED", path: "output", message: "Synthetic unsupported input combination" }] };
fails(inputFor([5000]), "ADAPTER_COMBINATION_UNSUPPORTED", blockedAdapter);

// Existing V1 factories, capability/preflight and Kling limits remain independent.
const v1 = finalProviders();
const configuration: FinalConfiguration = { version: "ugc-final-v1", funding: "operator_funded", authorizationId: id(80), language: "en",
  pricing: finalPricing(fixturePricingRaw), maxRequests: 20, maxEstimatedCostMicrousd: 30000000,
  ceilings: { video: 6250000, voice: 100000, design: 200000, binding: 10000, lip_sync: 200000 }, providers: adapterIdentities,
  composition: compositionProfile, output: { height: 720, fps: 25, format: "mp4", toleranceMs: 50, audioSampleRate: 48000 } };
const beforeV1 = finalPreflight(doc, configuration, v1);
equal(beforeV1.issues, []); equal(beforeV1.requests, 6);
equal("segmentPlanning" in v1.video, false);
equal(v1.video.getCapabilities().duration, { minMs: 4000, maxMs: 30000, incrementsMs: 1000 });
equal(v1.lip.validate(11000, 720, 1280), ["LIP_SYNC_DURATION_UNSUPPORTED"]);
plan(speaking); fails(speaking, "CAPABILITY_UNVERIFIED", seedance);
equal(finalPreflight(doc, configuration, v1), beforeV1);
equal(packageDigest("preserved-package", doc), packageDigest("preserved-package", savedPackage));
const core = fs.readFileSync("lib/final-video-generation-v2/planner.ts", "utf8");
ok(!/fal\.ai|seedance|kling|elevenlabs|process\.env|fetch\(/i.test(core));
for (const name of ["worker.ts", "preflight.ts", "server.ts", "adapters/registry.ts", "adapters/fal.ts"])
  ok(!fs.readFileSync(`lib/final-video-generation/${name}`, "utf8").includes("final-video-generation-v2"));
equal(networkCalls, 0);
console.log(`${checks} V2 foundation and V1 compatibility checks passed; zero network/provider requests.`);
