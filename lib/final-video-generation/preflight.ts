import type { VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import type { FinalConfiguration } from "./contract";
import { characterProfile, characterSpeech, dimensions, speech } from "./planning";
import type { VideoGenerationProvider, VoiceGenerationProvider, LipSyncProvider } from "./providers";
import { checkComposition, compositionRequirements } from "./composition";
import type { CapabilityIssue, CapabilityLayer } from "./capabilities";
import { executableSceneSchema, executionIssues } from "@/lib/execution-v1/contract";

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
      add(issue.field.includes("delivery") ? "voice" : issue.code === "EXECUTION_SCENE_DURATION" ? "video" : issue.code === "EXECUTION_LIP_SYNC_DURATION" ? "lip_sync" : "composition", issue.code, issue.sceneNumber);
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
  if (profile) for (const code of providers.voice.validate(profile, doc.scenes)) add("voice", code);
  const composition = checkComposition(compositionRequirements(doc), configuration.composition);
  diagnostics.push(...composition.issues);
  const breakdown: { label: string; kind: keyof FinalConfiguration["ceilings"]; sceneNumber?: number; provider: string; model: string;
    authorizationCeilingMicrousd: number; estimatedCostMicrousd: number; attempts: 1; source: "configured_operator_ceiling" }[] = [];
  const cost = (kind: keyof FinalConfiguration["ceilings"], label: string, sceneNumber?: number) => breakdown.push({ kind, label, sceneNumber,
    provider: configuration.providers[kind].id, model: configuration.providers[kind].model, authorizationCeilingMicrousd: configuration.ceilings[kind],
    estimatedCostMicrousd: configuration.ceilings[kind], attempts: 1, source: "configured_operator_ceiling" });
  for (const scene of doc.scenes) cost("video", `Scene ${scene.number} video`, scene.number);
  if (profile) { cost("design", "Voice Design"); cost("binding", "Voice identity save"); }
  for (const scene of doc.scenes) for (const [i] of speech(scene).entries()) cost("voice", `Scene ${scene.number} speech ${i + 1}`, scene.number);
  for (const scene of doc.scenes) if (characterSpeech(scene).length) cost("lip_sync", `Scene ${scene.number} lip-sync`, scene.number);
  const requests = breakdown.length;
  const estimatedCostMicrousd = breakdown.reduce((sum, item) => sum + item.estimatedCostMicrousd, 0);
  if (requests > configuration.maxRequests || estimatedCostMicrousd > configuration.maxEstimatedCostMicrousd) add("funding", "EXECUTION_BUDGET_INSUFFICIENT");
  const layers = Object.fromEntries((["video", "voice", "lip_sync", "composition", "funding"] as const).map(layer => [layer, diagnostics.filter(issue => issue.layer === layer)])) as Record<CapabilityLayer, CapabilityIssue[]>;
  return { issues: diagnostics.map(issue => issue.code), diagnostics, layers, composition, profile, requests, estimatedCostMicrousd, breakdown };
}
