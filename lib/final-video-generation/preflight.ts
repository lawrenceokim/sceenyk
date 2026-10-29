import type { VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import type { FinalConfiguration } from "./contract";
import { characterProfile, characterSpeech, dimensions, speech } from "./planning";
import type { VideoGenerationProvider, VoiceGenerationProvider, LipSyncProvider } from "./providers";
import { checkComposition, compositionRequirements } from "./composition";
import type { CapabilityIssue, CapabilityLayer } from "./capabilities";
import { executableSceneSchema, executionIssues } from "@/lib/execution-v1/contract";
import { estimateProviderCost, voiceDesignPreviewText, type CostEstimate, type CostInput } from "./adapters/pricing";
import { planSpeechTiming } from "@/lib/speech-timing/plan";

export function finalPreflight(doc: VideoGenerationPackage, configuration: FinalConfiguration,
  providers: { video: VideoGenerationProvider; voice: VoiceGenerationProvider; lip: LipSyncProvider }) {
  const diagnostics: CapabilityIssue[] = [];
  const add = (layer: CapabilityLayer, code: string, sceneNumber?: number) => diagnostics.push({ layer, code, sceneNumber,
    message: `${sceneNumber ? `scene-${sceneNumber}: ` : ""}${code} (layer: ${layer}).` });
  if (doc.schemaVersion !== 2 || doc.executionVersion !== "ugc-execution-v1") add("composition", "EXECUTION_CONTRACT_REQUIRED");
  else {
    const parsed = executableSceneSchema.array().safeParse(doc.scenes);
    if (!parsed.success) add("composition", "EXECUTION_CONTRACT_INVALID");
    else for (const issue of executionIssues({ schemaVersion: 2, durationMs: doc.timeline.totalDurationMs, scenes: parsed.data }))
      add(issue.field.includes("delivery") || issue.code === "EXECUTION_SPEECH_TIMING" ? "voice" : issue.code === "EXECUTION_SCENE_DURATION" ? "video" : issue.code === "EXECUTION_LIP_SYNC_DURATION" ? "lip_sync" : "composition", issue.code, issue.sceneNumber);
  }
  for (const issue of providers.video.validatePackage(doc.requirements).issues) add("video", issue.code, issue.scene);
  const caps = providers.video.getCapabilities();
  if (!caps.resolutions?.includes(`${configuration.output.height}p`)) add("video", "VIDEO_RESOLUTION_UNSUPPORTED");
  if (!caps.formats?.includes(configuration.output.format)) add("video", "VIDEO_FORMAT_UNSUPPORTED");
  const shape = dimensions(doc.output.aspectRatio);
  const inertMedia = new Map(["character", "product", "location"].map(role => [role, `https://invalid.example/${role}`]));
  for (const scene of doc.scenes) {
    try { providers.video.prepareScene(doc, scene, inertMedia); } catch { add("video", "VIDEO_REFERENCE_CAPABILITY", scene.number); }
    if (characterSpeech(scene).length) for (const code of providers.lip.validate(scene.durationMs, shape.width, shape.height)) add("lip_sync", code, scene.number);
  }
  const profile = characterProfile(doc, configuration);
  const designPreviewText = profile ? voiceDesignPreviewText(doc.scenes.flatMap(scene => speech(scene).map(line => line.text)), configuration.pricing) : undefined;
  if (profile) for (const code of providers.voice.validate(profile, doc.scenes)) add("voice", code);
  const composition = checkComposition(compositionRequirements(doc), configuration.composition);
  diagnostics.push(...composition.issues);
  const breakdown: (CostEstimate & { label: string; kind: keyof FinalConfiguration["ceilings"]; sceneNumber?: number; provider: string; model: string;
    operationKey: string; authorizationCeilingMicrousd: number; attempts: 1 })[] = [];
  const cost = (kind: keyof FinalConfiguration["ceilings"], operationKey: string, label: string, input: CostInput, sceneNumber?: number) => {
    const estimate = estimateProviderCost(kind, configuration, input);
    breakdown.push({ ...estimate, kind, label, operationKey, sceneNumber, provider: configuration.providers[kind].id,
      model: configuration.providers[kind].model, authorizationCeilingMicrousd: configuration.ceilings[kind], attempts: 1 });
    if (estimate.estimatedCostMicrousd === null) add("funding", "COST_ESTIMATE_UNAVAILABLE", sceneNumber);
    else if (estimate.estimatedCostMicrousd > configuration.ceilings[kind]) add("funding", "STAGE_AUTHORIZATION_CEILING_EXCEEDED", sceneNumber);
  };
  for (const scene of doc.scenes) cost("video", `video:${scene.id}`, `Scene ${scene.number} video`, { durationMs: scene.durationMs, aspectRatio: doc.output.aspectRatio }, scene.number);
  if (profile) { cost("design", "voice:design", "Voice Design", { text: designPreviewText }); cost("binding", "voice:binding", "Voice identity save", {}); }
  for (const scene of doc.scenes) for (const [i, line] of speech(scene).entries()) cost("voice", `voice:${scene.id}:${i}`, `Scene ${scene.number} speech ${i + 1}`, { text: line.text }, scene.number);
  for (const scene of doc.scenes) if (characterSpeech(scene).length) cost("lip_sync", `sync:${scene.id}`, `Scene ${scene.number} lip-sync`, { durationMs: scene.durationMs }, scene.number);
  const requests = breakdown.length;
  const elevenLabsRows = breakdown.filter(item => item.provider === "elevenlabs");
  const estimatedCredits = elevenLabsRows.reduce((sum, item) => sum + (item.estimatedCredits ?? 0), 0);
  const includedCredits = configuration.pricing?.elevenLabsIncludedCredits?.remainingCredits ?? null;
  const creditsExceeded = includedCredits !== null && estimatedCredits > includedCredits;
  if (creditsExceeded) add("funding", "ELEVENLABS_CREDIT_ALLOWANCE_EXCEEDED");
  const elevenLabs = { estimatedCredits, configuredIncludedCredits: includedCredits,
    remainingIncludedCreditsAfterRun: includedCredits === null ? null : includedCredits - estimatedCredits,
    billingMode: configuration.pricing?.elevenLabsIncludedCredits ? "included_credits" : configuration.pricing?.elevenLabsMicrousdPerCredit !== undefined ? "configured_usd_per_credit" : "unconfigured",
    estimatedUsdCost: creditsExceeded || elevenLabsRows.some(item => item.estimatedUsdCost === null) ? null : elevenLabsRows.reduce((sum, item) => sum + item.estimatedCostMicrousd!, 0) / 1000000 };
  const falEstimatedCostMicrousd = breakdown.filter(item => item.provider === "fal").reduce<number | null>((sum, item) => sum === null || item.estimatedCostMicrousd === null ? null : sum + item.estimatedCostMicrousd, 0);
  const knownSubtotalMicrousd = breakdown.reduce((sum, item) => sum + (item.estimatedCostMicrousd ?? 0), 0);
  const estimatedCostMicrousd = creditsExceeded || breakdown.some(item => item.estimatedCostMicrousd === null) ? null : knownSubtotalMicrousd;
  if (requests > configuration.maxRequests || knownSubtotalMicrousd > configuration.maxEstimatedCostMicrousd) add("funding", "EXECUTION_BUDGET_INSUFFICIENT");
  const layers = Object.fromEntries((["video", "voice", "lip_sync", "composition", "funding"] as const).map(layer => [layer, diagnostics.filter(issue => issue.layer === layer)])) as Record<CapabilityLayer, CapabilityIssue[]>;
  const speechTiming = doc.scenes.flatMap(scene => speech(scene).map(line => {
    try { if (typeof line.delivery === "string") return { sceneNumber: scene.number, feasible: false };
      return { sceneNumber: scene.number, text: line.text, startMs: line.startMs, endMs: line.endMs,
      ...planSpeechTiming(line.text, line.startMs, line.endMs, line.delivery.pace) }; }
    catch { return { sceneNumber: scene.number, feasible: false }; }
  }));
  return { issues: diagnostics.map(issue => issue.code), diagnostics, layers, composition, profile, designPreviewText, speechTiming, requests, estimatedCostMicrousd,
    estimatedUsdCost: estimatedCostMicrousd === null ? null : estimatedCostMicrousd / 1000000,
    elevenLabs, falEstimatedCostMicrousd, knownSubtotalMicrousd, breakdown };
}
