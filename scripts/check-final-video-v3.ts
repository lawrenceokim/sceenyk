import assert from "node:assert/strict";
import fs from "node:fs";
import { planGenerationSegments } from "../lib/final-video-generation-v3/planner";
import { executionReadiness } from "../lib/final-video-generation-v3/validation";
import { assertPaidV3Execution, commandFingerprint } from "../lib/final-video-generation-v3/identity";
import { HiggsfieldVideoGenerationProvider, HIGGSFIELD_V3_PROFILE, mapHiggsfieldStatus, prepareStatusObservation } from "../lib/final-video-generation-v3/adapters/higgsfield";
import { bindEstimateResponse, calculatePublishedVideoCost, usdToMicrousd } from "../lib/final-video-generation-v3/adapters/higgsfield-pricing";
import { OpenAICreativeDirectorProvider, OpenAIImageGenerationProvider } from "../lib/final-video-generation-v3/adapters/openai";
import { compileDirectorInstructions } from "../lib/final-video-generation-v3/compiler";
import type { PlanningInput, PlanningContext, VideoGenerationProvider, SegmentPlan } from "../lib/final-video-generation-v3/contract";
import { sealV3, v3Context, v3Id, v3Input, v3Provider } from "./final-video-v3-fixture";
import { canonicalInput, fixturePricingRaw, id } from "./final-video-fixture";
import { buildVideoGenerationPackage } from "../lib/video-generation-package/builder";
import { finalProviders, adapterIdentities } from "../lib/final-video-generation/adapters/registry";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalPricing } from "../lib/final-video-generation/adapters/pricing";
import { compositionProfile } from "../lib/final-video-generation/composition";
import type { FinalConfiguration } from "../lib/final-video-generation/contract";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN_IN_V3_CHECKS"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (a: unknown) => { assert.ok(a); checks++; };
const throws = (fn: () => unknown, code?: string) => { if (code) assert.throws(fn, new RegExp(code)); else assert.throws(fn); checks++; };
function planned(input: PlanningInput, provider: VideoGenerationProvider = v3Provider(), context = v3Context(input, provider)): SegmentPlan {
  const result = planGenerationSegments(input, provider, context); assert.ok(result.ok, JSON.stringify(result.ok ? [] : result.issues)); checks++; return result.plan;
}
function fails(input: unknown, code: string, context: PlanningContext, provider: VideoGenerationProvider = v3Provider()) {
  const result = planGenerationSegments(input, provider, context); ok(!result.ok); if (!result.ok) ok(result.issues.some(i => i.code === code));
}
for (const durations of [[5000], [5000, 5000], [6000, 6000, 6000, 6000, 6000]]) {
  const input = v3Input(durations), before = structuredClone(input), p = planned(input);
  equal(p.segments.length, 1); equal(p.segments[0].durationMs, durations.reduce((a, b) => a + b, 0));
  equal(p.composition, "direct_final_review"); equal(p.paidExecutionEnabled, false); equal(input, before);
  equal(p.segments[0].command.resolution, "480p"); equal(p.segments[0].command.generateAudio, true);
  equal(p.segments[0].executionStatus, "not_started"); equal(p.segments[0].actualProviderCostMicrousd, null);
  ok(Object.isFrozen(p)); ok(Object.isFrozen(p.segments[0].command.direction.scenes));
}
for (const [durations, expected] of [
  [[27000, 4000], [27000, 4000]], [[30000, 15000], [30000, 15000]], [[30000, 30000], [30000, 30000]],
  [Array(31).fill(1000), [27000, 4000]], [Array(9).fill(5000), [30000, 15000]],
] as [number[], number[]][]) {
  const p = planned(v3Input(durations)); equal(p.segments.map(s => s.durationMs), expected); equal(p.composition, "review_segments_then_join");
  ok(p.segments.every(s => s.durationMs >= 4000 && s.durationMs <= 30000 && s.durationMs % 1000 === 0));
  equal(p.segments.flatMap(s => s.includedSceneNumbers), durations.map((_, i) => i + 1));
}
fails(v3Input([30000, 1000]), "DURATION_UNREPRESENTABLE", v3Context(v3Input([30000, 1000])));
fails(v3Input([31000]), "SCENE_REPLANNING_REQUIRED", v3Context(v3Input([31000])));
fails(v3Input([3500]), "DURATION_UNREPRESENTABLE", v3Context(v3Input([3500])));
equal(planned(v3Input([5000, 3000, 2000]), v3Provider(c => { c.supportedDurationsMs = [5000, 8000]; c.maxContinuousDurationMs = 8000; })).segments.map(s => s.durationMs), [5000, 5000]);

const speaking = v3Input(), delivery = { pace: "natural" as const, energy: "balanced" as const, tone: "warm" as const, emphasis: "none" as const, style: "conversational" as const };
speaking.storyboardContent.scenes[0].speech = [{ startMs: 1200, endMs: 2600, speaker: "character", text: "Look at this.", delivery, deliveryNote: "Relaxed" }];
speaking.storyboardContent.scenes[1].speech = [{ startMs: 6200, endMs: 7600, speaker: "character", text: "Ready to go.", delivery, deliveryNote: "Warm" }];
sealV3(speaking);
const before = structuredClone(speaking), p10 = planned(speaking), compiled = p10.segments[0].command.direction;
equal(p10.readinessIssues, []);
equal(compiled.dialogue.map(d => [d.text, d.startMs, d.endMs]), [["Look at this.", 1200, 2600], ["Ready to go.", 6200, 7600]]);
ok(compiled.prompt.includes("0–5s: Scene 1")); ok(compiled.prompt.includes("At 5s: Cut to Scene 2")); ok(compiled.prompt.includes("5–10s: Scene 2"));
ok(compiled.prompt.includes('exact words: "Look at this."')); ok(compiled.prompt.includes('exact words: "Ready to go."'));
for (const text of ["Blue jacket", "ceramic cup", "studio", "Slow push in", "Facial reaction", "Lighting", "Sound intention"]) ok(compiled.prompt.includes(text));
equal(compiled.scenes, speaking.storyboardContent.scenes); equal(speaking, before);
equal(compiled.creative.continuity.outfit, "Blue jacket"); equal(compiled.creative.visualStyle, "Realistic");
equal(compiled.shotChanges[0], { fromSceneNumber: 1, toSceneNumber: 2, atMs: 5000, localAtMs: 5000, transition: { type: "cut", durationMs: 0 }, owner: "generation" });
throws(() => { p10.segments[0].command.direction.scenes[0].description = "Changed"; });
throws(() => compileDirectorInstructions(speaking, 1, 1), "DIRECTOR_SCENE_RANGE_INVALID");
const longer = v3Input([30000, 5000]); longer.storyboardContent.scenes[1].speech = [{ ...speaking.storyboardContent.scenes[0].speech[0], startMs: 31200, endMs: 32600 }]; sealV3(longer);
equal(planned(longer).segments[1].command.direction.dialogue[0].localStartMs, 1200);
ok(planned(longer).segments[0].command.direction.prompt.includes("Boundary at 30s"));
equal(planned(longer).segments[0].command.direction.shotChanges.at(-1)?.owner, "join");

const stable = planned(speaking); equal(planned(speaking).fingerprint, stable.fingerprint);
const reverseKeys = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseKeys) : value && typeof value === "object" ?
  Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)])) : value;
const reordered = reverseKeys(speaking);
const reorderedResult = planGenerationSegments(reordered, v3Provider(), v3Context(speaking)); ok(reorderedResult.ok); if (reorderedResult.ok) equal(reorderedResult.plan.fingerprint, stable.fingerprint);
equal(planned(speaking, v3Provider(c => { c.supportedDurationsMs.reverse(); c.supportedAspectRatios.reverse(); })).fingerprint, stable.fingerprint);
for (const mutate of [
  (i: PlanningInput) => { i.storyboardContent.scenes[0].camera.movement = "Pan right"; },
  (i: PlanningInput) => { i.storyboardContent.scenes[0].speech[0].text = "New approved words."; },
  (i: PlanningInput) => { i.references[0].sha256 = "f".repeat(64); },
  (i: PlanningInput) => { i.resolution = "720p"; },
]) { const changed = structuredClone(speaking); mutate(changed); sealV3(changed); ok(planned(changed).fingerprint !== stable.fingerprint); }
ok(planned(speaking, v3Provider(c => { c.providerId = "alternative-provider"; c.adapterVersion = "alternative-v3"; })).capabilityHash !== stable.capabilityHash);
const switched = structuredClone(speaking); switched.profileId = "another-v3-profile";
fails(switched, "PROVIDER_PROFILE_MISMATCH", v3Context(switched));
ok(planned(switched, v3Provider(c => { c.profileId = "another-v3-profile"; })).fingerprint !== stable.fingerprint);

const stale = v3Context(speaking); stale.current.package.version++; fails(speaking, "APPROVED_INPUT_STALE", stale);
const staleRef = v3Context(speaking); staleRef.current.references[0].version++; fails(speaking, "APPROVED_INPUT_STALE", staleRef);
const contentChanged = structuredClone(speaking); contentChanged.storyboardContent.scenes[0].description += " changed";
fails(contentChanged, "STORYBOARD_HASH_MISMATCH", v3Context(contentChanged));
const crossProject = v3Input(); crossProject.references[0].projectId = v3Id(999); sealV3(crossProject); fails(crossProject, "REFERENCE_PROJECT_MISMATCH", v3Context(crossProject));
fails({ ...v3Input(), workflow: "ugc-final-v1" }, "PLANNING_INPUT_INVALID", v3Context(v3Input()));
const oldAsset = v3Input(); fails({ ...oldAsset, references: [{ ...oldAsset.references[0], originWorkflow: "ugc-final-v2-foundation" }, ...oldAsset.references.slice(1)] }, "PLANNING_INPUT_INVALID", v3Context(oldAsset));
const unsupportedRes = v3Input(); unsupportedRes.resolution = "4k"; fails(unsupportedRes, "RESOLUTION_UNSUPPORTED", v3Context(unsupportedRes));
const ratio = v3Input(); ratio.storyboardContent.aspectRatio = "5:4"; sealV3(ratio); fails(ratio, "ASPECT_RATIO_UNSUPPORTED", v3Context(ratio));
const badTiming = v3Input(); badTiming.storyboardContent.scenes[1].startMs++; sealV3(badTiming); fails(badTiming, "SCENE_TIMING_INVALID", v3Context(badTiming));
const incomplete = v3Input(); incomplete.storyboardContent.scenes[0].camera.movement = ""; sealV3(incomplete); fails(incomplete, "PLANNING_INPUT_INVALID", v3Context(incomplete));
fails(v3Input(), "PROMPT_LIMIT_EXCEEDED", v3Context(v3Input()), v3Provider(c => { c.maxPromptCharacters = 10; }));
const missingRole = v3Input(); missingRole.references.pop(); sealV3(missingRole); fails(missingRole, "REFERENCE_ROLE_MISSING", v3Context(missingRole));
ok(planned(v3Input(), v3Provider(c => { c.referenceLimits.image.maxCount = 2; })).readinessIssues.some(i => i.code === "REFERENCE_COUNT_EXCEEDED"));
ok(planned(v3Input(), v3Provider(c => { c.referenceLimits.image.maxBytes = 100; })).readinessIssues.some(i => i.code === "REFERENCE_SIZE_EXCEEDED"));
ok(planned(speaking, v3Provider(c => { c.features.nativeDialogue = "unsupported"; })).readinessIssues.some(i => i.code === "CAPABILITY_UNSUPPORTED"));
const requiredEffects = v3Input(); requiredEffects.storyboardContent.scenes[0].audio.effects = { requirement: "required", description: "A gentle cup tap", assetId: null }; sealV3(requiredEffects);
ok(planned(requiredEffects, v3Provider(c => { c.features.nativeSoundEffects = "unverified"; })).readinessIssues.some(i => i.code === "CAPABILITY_UNVERIFIED"));
const muted = structuredClone(speaking); muted.generateAudio = false; ok(planned(muted).readinessIssues.some(i => i.code === "NATIVE_AUDIO_REQUIRED"));
const narrow = v3Context(speaking); narrow.authorization.maxRequests = 0;
ok(planned(speaking, v3Provider(), narrow).readinessIssues.some(i => i.code === "REQUEST_AUTHORIZATION_INSUFFICIENT"));
const cheap = v3Context(speaking); cheap.authorization.maxCostMicrousd = 1;
const cheapPlan = planned(speaking, v3Provider(), cheap); ok(cheapPlan.readinessIssues.some(i => i.code === "COST_AUTHORIZATION_INSUFFICIENT"));
equal(cheapPlan.segments[0].estimate.estimatedCostMicrousd, stable.segments[0].estimate.estimatedCostMicrousd);
const wrongAuth = v3Context(speaking); wrongAuth.authorization.projectId = v3Id(888);
ok(planned(speaking, v3Provider(), wrongAuth).readinessIssues.some(i => i.code === "AUTHORIZATION_SCOPE_INVALID"));
const changedOutput = structuredClone(speaking); changedOutput.resolution = "720p";
ok(planned(changedOutput, v3Provider(), v3Context(speaking)).readinessIssues.some(i => i.code === "AUTHORIZATION_SCOPE_INVALID"));
const invalidPrice: VideoGenerationProvider = { ...v3Provider(), estimateCost: () => ({ ...stable.segments[0].estimate, estimatedCostMicrousd: -1 }) };
fails(speaking, "ESTIMATE_RECEIPT_INVALID", v3Context(speaking), invalidPrice);

const adapter = new HiggsfieldVideoGenerationProvider(), caps = adapter.capabilities();
equal(caps.maxContinuousDurationMs, 30000); equal(caps.supportedResolutions, ["480p", "720p", "1080p"]); equal(caps.supportedFormats, ["mp4", "mov"]);
equal(caps.referenceLimits.image.maxCount, null); equal(caps.features.nativeDialogue, "unverified");
const actual = planned(speaking, adapter), context = v3Context(speaking, adapter), segment = actual.segments[0];
ok(actual.readinessIssues.some(i => i.code === "REFERENCE_LIMIT_UNVERIFIED")); ok(actual.readinessIssues.some(i => i.code === "CAPABILITY_UNVERIFIED"));
ok(actual.readinessIssues.some(i => i.code === "COST_ESTIMATE_UNAVAILABLE")); equal(segment.estimate.estimatedCostMicrousd, null);
const urls = new Map(speaking.references.map(ref => [ref.id, `https://media.example.invalid/${ref.id}.png`]));
const request = adapter.prepareRequest(segment, urls);
equal(request.executable, false); equal(request.model, "bytedance/seedance-2.5/reference-to-video");
equal(request.generationUrl, "https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video");
equal(request.estimateUrl, "https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/reference-to-video");
equal(request.input.duration, 10); equal(request.input.resolution, "480p"); equal(request.input.generate_audio, true); equal(request.input.aspect_ratio, "9:16");
equal((request.input.image_urls as string[]).length, 3); ok(!("audio_urls" in request.input)); ok(!("submit" in adapter));
ok(String(request.input.prompt).includes("image reference 1 defines character: Kai"));
throws(() => adapter.prepareRequest(planned(speaking).segments[0], urls), "PROVIDER_SNAPSHOT_CHANGED");
throws(() => adapter.prepareRequest(segment, new Map()), "REFERENCE_DELIVERY_MISSING");
const badUrls = new Map(urls); badUrls.set(speaking.references[0].id, "https://127.0.0.1/private"); throws(() => adapter.prepareRequest(segment, badUrls), "MEDIA_URL_INVALID");
const quote = bindEstimateResponse(segment.command, { usd: "1.2345678" }, { providerId: "higgsfield", accountScope: context.accountScope,
  observedAt: "2026-10-29T12:00:00+01:00", expiresAt: "2026-10-29T13:00:00+01:00" });
context.estimateEvidence = [quote]; const quoted = planned(speaking, adapter, context);
equal(quoted.segments[0].estimate.estimatedCostMicrousd, 1234568); equal(quoted.segments[0].fingerprint, segment.fingerprint);
equal(quoted.segments[0].actualProviderCostMicrousd, null); equal(quoted.segments[0].providerReceipt, null);
const higher = structuredClone(context); higher.authorization.maxCostMicrousd *= 2;
equal(planned(speaking, adapter, higher).segments[0].estimate.estimatedCostMicrousd, 1234568);
equal(quoted.authorizationSnapshot.maxCostMicrousd, context.authorization.maxCostMicrousd);
ok(executionReadiness(quoted, higher, adapter).issues.some(i => i.code === "AUTHORIZATION_SNAPSHOT_CHANGED"));
equal(adapter.estimateCost({ ...segment.command, generateAudio: false }, [quote], context.accountScope, context.now).estimatedCostMicrousd, null);
equal(adapter.estimateCost(segment.command, [quote], "different-account", context.now).estimatedCostMicrousd, null);
equal(adapter.estimateCost(segment.command, [quote], context.accountScope, "2026-10-29T14:00:00+01:00").estimatedCostMicrousd, null);
equal(adapter.estimateCost(segment.command, [quote, { ...quote, usd: "2" }], context.accountScope, context.now).reason, "ESTIMATE_RECONCILIATION_REQUIRED");
for (const invalid of ["-1", "NaN", "1e3", "", "9007199254740991"]) equal(usdToMicrousd(invalid), null);
equal(usdToMicrousd("0"), 0); equal(usdToMicrousd("0.0000001"), 1);
throws(() => bindEstimateResponse(segment.command, { usd: -1 }, { providerId: "higgsfield", accountScope: "x", observedAt: context.now, expiresAt: context.now }), "PROVIDER_ESTIMATE_INVALID");
equal(calculatePublishedVideoCost({ width: 854, height: 480, durationMs: 10000, referenceVideoDurationMs: 0, resolution: "480p" }), { tokens: "96075", costMicrousd: 2056005 });
equal(calculatePublishedVideoCost({ width: 1280, height: 720, durationMs: 10000, referenceVideoDurationMs: 8000, resolution: "720p" }), { tokens: "388800", costMicrousd: 4992192 });
equal(calculatePublishedVideoCost({ width: 0, height: 480, durationMs: 5000, referenceVideoDurationMs: 0, resolution: "480p" }), null);
ok(!executionReadiness(quoted, context, adapter).eligible); ok(executionReadiness(quoted, context, adapter).issues.some(i => i.code === "PAID_V3_EXECUTION_DISABLED"));
throws(() => assertPaidV3Execution(), "PAID_V3_EXECUTION_DISABLED");
const tampered = structuredClone(quoted); tampered.segments[0].command.resolution = "720p";
ok(executionReadiness(tampered, context, adapter).issues.some(i => i.code === "PLAN_INTEGRITY_INVALID"));
throws(() => adapter.prepareRequest(tampered.segments[0], urls), "SEGMENT_BINDING_INVALID");
const changedCurrentRef = structuredClone(context); changedCurrentRef.current.references[0].approvalVersion++;
ok(executionReadiness(quoted, changedCurrentRef, adapter).issues.some(i => i.code === "APPROVED_INPUT_STALE"));
const expiredContext = structuredClone(context); expiredContext.now = "2026-10-29T14:00:00+01:00";
ok(executionReadiness(quoted, expiredContext, adapter).issues.some(i => i.code === "ESTIMATE_STALE_OR_UNAVAILABLE"));
ok(executionReadiness(quoted, context, v3Provider()).issues.some(i => i.code === "PROVIDER_SNAPSHOT_CHANGED"));

const multimodal = v3Input(); multimodal.references.push(
  { ...multimodal.references[0], id: v3Id(201), role: "motion", kind: "video", mimeType: "video/mp4", durationMs: 5000 },
  { ...multimodal.references[0], id: v3Id(202), role: "sound", kind: "audio", mimeType: "audio/wav", durationMs: 8000 }); sealV3(multimodal);
const multimodalSegment = planned(multimodal, adapter).segments[0];
const mediaUrls = new Map(multimodal.references.map(ref => [ref.id, `https://media.example.invalid/${ref.id}`]));
const multimodalRequest = adapter.prepareRequest(multimodalSegment, mediaUrls);
equal((multimodalRequest.input.audio_urls as string[]).length, 1); equal((multimodalRequest.input.video_urls as string[]).length, 1);
equal(multimodalRequest.input.generate_audio, true);
equal(adapter.estimateCost(multimodalSegment.command, [quote], context.accountScope, context.now).estimatedCostMicrousd, null);

const textInput = v3Input([5000]); textInput.mode = "text"; textInput.references = []; sealV3(textInput);
const textRequest = adapter.prepareRequest(planned(textInput, adapter).segments[0], new Map());
equal(textRequest.model, "bytedance/seedance-2.5/text-to-video"); ok(!("image_urls" in textRequest.input));
const imageInput = v3Input([5000]); imageInput.mode = "image"; imageInput.references = imageInput.references.slice(0, 1); imageInput.references[0].role = "start_frame"; sealV3(imageInput);
const imageRequest = adapter.prepareRequest(planned(imageInput, adapter).segments[0], new Map([[imageInput.references[0].id, "https://media.example.invalid/start.png"]]));
equal(imageRequest.model, "bytedance/seedance-2.5/image-to-video"); ok("image_url" in imageRequest.input); ok(!("aspect_ratio" in imageRequest.input));
for (const [status, expected] of [["queued", "pending"], ["in_progress", "running"], ["failed", "failed"], ["nsfw", "rejected"], ["canceled", "canceled"], ["new_state", "reconciliation_required"]])
  equal(mapHiggsfieldStatus({ request_id: v3Id(90), status }, v3Id(90)).state, expected);
for (const status of ["toString", "constructor", "__proto__"]) equal(mapHiggsfieldStatus({ request_id: v3Id(90), status }, v3Id(90)).state, "reconciliation_required");
equal(mapHiggsfieldStatus({ request_id: v3Id(90), status: "completed", video: { url: "https://cdn.example.invalid/final.mp4" } }, v3Id(90)).state, "completed");
equal(mapHiggsfieldStatus({ request_id: v3Id(90), status: "completed" }, v3Id(90)).state, "invalid_result");
equal(mapHiggsfieldStatus({ request_id: v3Id(91), status: "queued" }, v3Id(90)).state, "reconciliation_required");
equal(prepareStatusObservation(v3Id(90), `https://api.higgsfield.ai/requests/${v3Id(90)}/status`).executable, false);
throws(() => prepareStatusObservation(v3Id(90), "https://evil.invalid/status"), "STATUS_LOCATOR_INVALID");
throws(() => prepareStatusObservation(v3Id(90), `https://api.higgsfield.ai/requests/${v3Id(90)}/status?redirect=1`), "STATUS_LOCATOR_INVALID");

const director = new OpenAICreativeDirectorProvider({ model: "synthetic-director", maxOutputTokens: 14000 });
const directorRequest = director.prepareStoryboard({ instruction: "Show Kai with the new cup", durationMs: 10000, referenceUrls: [...urls.values()] });
equal(directorRequest.executable, false); ok(directorRequest.body.text?.format); equal(director.parseStoryboard(speaking.storyboardContent), speaking.storyboardContent);
const images = new OpenAIImageGenerationProvider({ mainlineModel: "synthetic-mainline", imageModel: "gpt-image-2.5-sunburst" });
const imageEdit = images.prepareReference({ instruction: "Regenerate the supplied reference", identityInstructions: "Preserve Kai's identity", referenceUrls: ["https://media.example.invalid/new-original.png"] });
equal(imageEdit.executable, false); equal(imageEdit.body.store, false); ok(!("submit" in images));
throws(() => images.prepareReference({ instruction: "Edit", identityInstructions: "Preserve", referenceUrls: [] }), "REFERENCE_IMAGE_REQUIRED");
throws(() => director.prepareStoryboard({ instruction: "", durationMs: 10000, referenceUrls: [] }));

// V1's known preflight behavior is unchanged, and V2 imports no V3 code.
const config: FinalConfiguration = { version: "ugc-final-v1", funding: "operator_funded", authorizationId: id(80), language: "en",
  pricing: finalPricing(fixturePricingRaw), maxRequests: 20, maxEstimatedCostMicrousd: 30000000,
  ceilings: { video: 6250000, voice: 100000, design: 200000, binding: 10000, lip_sync: 200000 }, providers: adapterIdentities,
  composition: compositionProfile, output: { height: 720, fps: 25, format: "mp4", toleranceMs: 50, audioSampleRate: 48000 } };
const v1 = finalProviders(), oldDoc = buildVideoGenerationPackage(canonicalInput, 1), oldPlan = finalPreflight(oldDoc, config, v1);
equal(oldPlan.issues, []); equal(oldPlan.requests, 6); equal(v1.lip.validate(11000, 720, 1280), ["LIP_SYNC_DURATION_UNSUPPORTED"]);
planned(speaking); equal(finalPreflight(oldDoc, config, v1), oldPlan);
for (const source of ["lib/final-video-generation/worker.ts", "lib/final-video-generation/adapters/registry.ts", "lib/final-video-generation-v2/planner.ts"])
  ok(!fs.readFileSync(source, "utf8").includes("final-video-generation-v3"));
for (const source of ["planner.ts", "compiler.ts", "validation.ts"]) ok(!/higgsfield|fal\.ai|elevenlabs|kling|fetch\(|process\.env/i.test(fs.readFileSync(`lib/final-video-generation-v3/${source}`, "utf8")));
equal(commandFingerprint(segment.command), segment.fingerprint); equal(segment.command.profileId, HIGGSFIELD_V3_PROFILE);
equal(networkCalls, 0); console.log(`${checks} V3 foundation, pricing, compiler and V1/V2 compatibility checks passed; zero network/provider requests.`);
