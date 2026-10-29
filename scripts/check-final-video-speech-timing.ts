// Pure planning, synthetic response replay and local audio fixtures only.
// No env loading, provider HTTP, real worker/execution, database or R2 writes.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { planSpeechTiming, type SpeechAlignment } from "../lib/speech-timing/plan";
import { fitSpeechFile, localTempo, validateCharacterTiming, SpeechFitLimitError } from "../lib/final-video-generation/speech-fitting";
import { elevenLabsDelivery, elevenLabsSpeechRequest, ElevenLabsVoiceGenerationProvider } from "../lib/final-video-generation/adapters/elevenlabs";
import { defaultDelivery, executionIssues, executableSceneSchema } from "../lib/execution-v1/contract";
import { runMediaCommand } from "../lib/media-preparation/ffmpeg";
import { buildVideoGenerationPackage } from "../lib/video-generation-package/builder";
import { canonicalInput, fixturePricingRaw, id } from "./final-video-fixture";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalProviders, adapterIdentities } from "../lib/final-video-generation/adapters/registry";
import { finalPricing } from "../lib/final-video-generation/adapters/pricing";
import { compositionProfile } from "../lib/final-video-generation/composition";
import { alignedAudio, verifyCompositionProcessor } from "../lib/final-video-generation/media";
import type { FinalExecution } from "../lib/final-video-generation/contract";
import { inspectPreparedStoryboard, prepareStoryboard } from "../lib/storyboard/contract";

async function main() {
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_SPEECH_TIMING_CHECKS"); };
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const throws = (f: () => unknown, pattern: RegExp) => { assert.throws(f, pattern); checks++; };
  const target = planSpeechTiming("Smooth and ready.", 6200, 7600, "natural");
  equal(target.windowMs, 1400); equal(target.safetyMs, 140); equal(target.targetSpeedPermille, 1040); equal(target.feasible, true);
  equal(elevenLabsSpeechRequest("Smooth and ready.", defaultDelivery(), [], target).voice_settings.speed, 1.04);
  equal(elevenLabsSpeechRequest("Smooth and ready.", defaultDelivery(), [], target).text, "Smooth and ready.");
  equal(elevenLabsDelivery(defaultDelivery(), 700).speed, 0.7); equal(elevenLabsDelivery(defaultDelivery(), 1200).speed, 1.2);
  throws(() => elevenLabsDelivery(defaultDelivery(), 699), /FINAL_SPEECH_TARGET_INVALID/);
  throws(() => elevenLabsDelivery(defaultDelivery(), 1201), /FINAL_SPEECH_TARGET_INVALID/);
  const impossible = planSpeechTiming("This exact dialogue is far too long for this tiny window.", 0, 400, "natural");
  equal(impossible.feasible, false); ok(impossible.targetSpeedPermille > 1200);
  throws(() => elevenLabsSpeechRequest("too long", defaultDelivery(), [], impossible), /FINAL_SPEECH_TARGET_INVALID/);
  throws(() => planSpeechTiming("word", 20, 20, "natural"), /SPEECH_TIMING_INPUT_INVALID/);
  equal(planSpeechTiming("Hi", 0, 2000, "slow").targetSpeedPermille, 900);
  equal(localTempo(1440, 1400), 1048); equal(localTempo(1000, 1400), 1000);
  equal(localTempo(1053, 1000), 1080);
  throws(() => localTempo(1054, 1000), /FINAL_SPEECH_RETRY_REQUIRED/);
  throws(() => localTempo(1440, 1400, 1000), /FINAL_SPEECH_RETRY_REQUIRED/);
  throws(() => localTempo(1440, 1400, 1081), /FINAL_SPEECH_FIT_POLICY_INVALID/);
  const doc = buildVideoGenerationPackage(canonicalInput, 1);
  const tooLong = structuredClone(doc);
  tooLong.scenes[1].speech[0].text = "An obviously impossible number of words for this exact short speech window.";
  ok(executionIssues({ schemaVersion: 2, scenes: executableSceneSchema.array().parse(tooLong.scenes), durationMs: tooLong.timeline.totalDurationMs }).some(i => i.code === "EXECUTION_SPEECH_TIMING"));
  const invalidStoryboard = structuredClone(canonicalInput.storyboard.document);
  invalidStoryboard.scenes[1].speech[0].text = "An obviously impossible number of words for this exact short speech window.";
  const report = inspectPreparedStoryboard(invalidStoryboard, canonicalInput.source).report;
  ok(report.issues.some(i => i.code === "SPEECH_WORD_BUDGET_EXCEEDED"));
  ok(report.issues.some(i => i.code === "EXECUTION_SPEECH_TIMING"));
  const tight = structuredClone(canonicalInput.storyboard.document);
  tight.scenes[1].speech[0] = { ...tight.scenes[1].speech[0], text: "One two three",
    endMs: tight.scenes[1].speech[0].startMs + 1120, delivery: defaultDelivery("energetic") };
  const tightReport = inspectPreparedStoryboard(tight, canonicalInput.source).report;
  equal(tightReport.issues.some(i => i.code === "SPEECH_WORD_BUDGET_EXCEEDED" || i.code === "SPEECH_CHARACTER_BUDGET_EXCEEDED"), false);
  ok(tightReport.issues.some(i => i.code === "EXECUTION_SPEECH_TIMING"));
  throws(() => buildVideoGenerationPackage({ ...canonicalInput, storyboard: { ...canonicalInput.storyboard,
    document: prepareStoryboard(tight, canonicalInput.source) } }, 1), /EXECUTION_SPEECH_TIMING/);
  throws(() => buildVideoGenerationPackage({ ...canonicalInput, storyboard: { ...canonicalInput.storyboard,
    document: prepareStoryboard(invalidStoryboard, canonicalInput.source) } }, 1), /SPEECH_WORD_BUDGET_EXCEEDED/);
  const configuration = { version: "ugc-final-v1" as const, funding: "operator_funded" as const, authorizationId: id(80), language: "en", maxRequests: 8,
    maxEstimatedCostMicrousd: 7000000, ceilings: { video: 6250000, design: 200000, binding: 10000, voice: 100000, lip_sync: 200000 }, providers: adapterIdentities,
    pricing: finalPricing(fixturePricingRaw), composition: compositionProfile,
    output: { height: 720 as const, fps: 25 as const, format: "mp4" as const, toleranceMs: 50 as const, audioSampleRate: 48000 as const } };
  ok(finalPreflight(tooLong, configuration, finalProviders()).layers.voice.some(i => i.code === "EXECUTION_SPEECH_TIMING"));
  const valid = finalPreflight(doc, configuration, finalProviders()); equal(valid.issues, []);
  await verifyCompositionProcessor(valid.composition.plan!, true); checks++;
  // Do not mutate approved fixture text/windows/profile while deriving a plan.
  const snapshot = JSON.stringify(canonicalInput); planSpeechTiming("Smooth and ready.", 6200, 7600, "natural"); equal(JSON.stringify(canonicalInput), snapshot);
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sceenyk-speech-test-"));
  try {
    const source = path.join(directory, "source.mp3"), output = path.join(directory, "fitted.wav");
    await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-f", "lavfi", "-i", "sine=frequency=440:duration=1.44",
      "-c:a", "libmp3lame", "-ar", "44100", "-ac", "1", source]);
    const sourceBefore = await fs.readFile(source);
    const alignment: SpeechAlignment = { original: { characters: ["a"], startsMs: [0], endsMs: [1440] }, normalized: null };
    const alignmentBefore = structuredClone(alignment);
    const fitted = await fitSpeechFile(source, output, "a", 1400, alignment);
    equal(fitted.metadata.mimeType, "audio/wav"); ok(fitted.metadata.durationMs <= 1400); ok(fitted.metadata.durationMs >= 1300);
    equal(fitted.proof.tempoPermille, 1048); equal(fitted.proof.originalAlignment, alignmentBefore); equal(alignment, alignmentBefore);
    equal(fitted.proof.trimStartMs, 0); equal(fitted.proof.trimEndMs, 0); equal(await fs.readFile(source), sourceBefore);
    equal(fitted.proof.fittedAlignment.original?.characters, ["a"]);
    equal(fitted.proof.fittedAlignment.original?.endsMs, [1374]);
    const repeated = await fitSpeechFile(source, path.join(directory, "repeat.wav"), "a", 1400, alignment);
    equal(repeated.bytes, fitted.bytes); equal(repeated.proof, fitted.proof);
    const unchanged = await fitSpeechFile(source, path.join(directory, "roomy.wav"), "a", 2000, alignment);
    equal(unchanged.proof.tempoPermille, 1000); equal(unchanged.proof.fittedAlignment, alignment);
    const recoveryDirectory = process.env.UGC_FINAL_RECOVERY_DIR;
    try {
      process.env.UGC_FINAL_RECOVERY_DIR = directory;
      const guide = await alignedAudio({ id: randomUUID(), claim_token: randomUUID() } as FinalExecution,
        [{ bytes: fitted.bytes, offsetMs: 1200, windowMs: 1400 }], 5000);
      ok(Math.abs(guide.metadata.durationMs - 5000) <= 50);
      const guideFile = path.join(directory, "guide.mp3"); await fs.writeFile(guideFile, guide.bytes);
      const audibleAt = async (seconds: number) => {
        const stats = await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-ss", String(seconds), "-i", guideFile, "-t", "0.1",
          "-af", "astats=metadata=1:reset=0,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-", "-f", "null", "-"]);
        return [...stats.matchAll(/RMS_level=([^\r\n]+)/g)].some(match => Number(match[1]) > -50);
      };
      equal(await audibleAt(0.6), false); equal(await audibleAt(1.7), true); equal(await audibleAt(2.7), false);
    } finally { if (recoveryDirectory === undefined) delete process.env.UGC_FINAL_RECOVERY_DIR; else process.env.UGC_FINAL_RECOVERY_DIR = recoveryDirectory; }
    // Count PCM zero crossings: atempo must retain 440Hz within 2%.
    const wav = await fs.readFile(output); let offset = 12, data: Buffer | undefined;
    while (offset + 8 <= wav.length) { const length = wav.readUInt32LE(offset + 4);
      if (wav.toString("ascii", offset, offset + 4) === "data") { data = wav.subarray(offset + 8, offset + 8 + length); break; }
      offset += 8 + length + length % 2;
    }
    ok(data); let crossings = 0;
    for (let i = 2; i < data!.length; i += 2) if (data!.readInt16LE(i - 2) <= 0 && data!.readInt16LE(i) > 0) crossings++;
    const frequency = crossings / (data!.length / 2 / 48000); ok(Math.abs(frequency - 440) < 8.8);
    await assert.rejects(fitSpeechFile(source, path.join(directory, "unsafe.wav"), "a", 1000, alignment), (error: unknown) =>
      error instanceof SpeechFitLimitError && error.details.decodedDurationMs === 1440 && error.details.windowMs === 1000 &&
      error.details.maximumTempoPermille === 1080 && error.details.requiredTempoPermille > 1080); checks++;
    await assert.rejects(fitSpeechFile(source, path.join(directory, "wrong-text.wav"), "wrong", 1400, alignment), /FINAL_VOICE_ALIGNMENT_INVALID/); checks++;
    throws(() => validateCharacterTiming({ characters: ["a"], startsMs: [0], endsMs: [5000] }, 1400, "a"), /FINAL_VOICE_ALIGNMENT_INVALID/);
    // Test the actual adapter replaying a preserved success. All fetches throw;
    // timing fitting never submits, designs or binds a voice.
    const voice = new ElevenLabsVoiceGenerationProvider(), saved = { result: { alignment: { characters: ["a"], character_start_times_seconds: [0], character_end_times_seconds: [1.44] } } };
    equal(voice.timing(saved), alignment); voice.validateTiming({ ...saved, speechFit: fitted.proof }, fitted.metadata.durationMs); checks++;
    const key = process.env.ELEVENLABS_API_KEY;
    try {
      process.env.ELEVENLABS_API_KEY = "synthetic-offline-only";
      const response = await voice.synthesize("a", defaultDelivery(), valid.profile!, { result: { bindingRef: "saved-voice" } }, [],
        { signal: new AbortController().signal, received: async () => {}, replayResponse: Buffer.from(JSON.stringify({ audio_base64: sourceBefore.toString("base64"), alignment: saved.result.alignment })) }, planSpeechTiming("a", 0, 1400, "natural"));
      equal(response.bytes, sourceBefore); equal(voice.timing(response.receipt), alignment);
    } finally { if (key === undefined) delete process.env.ELEVENLABS_API_KEY; else process.env.ELEVENLABS_API_KEY = key; }
  } finally {
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(directory).startsWith("sceenyk-speech-test-")) throw new Error("TEST_TEMP_SCOPE");
    await fs.rm(directory, { recursive: true, force: true });
  }
  console.info(`Final speech timing checks passed: ${checks}; local fixtures/replay only; provider/worker/live mutations: none`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
