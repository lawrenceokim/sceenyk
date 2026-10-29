// Entirely synthetic new-project V3 evidence. No historical execution or media.
import { planningInputSchema, V3_WORKFLOW, type PlanningContext, type PlanningInput, type VideoGenerationProvider } from "../lib/final-video-generation-v3/contract";
import { normalizeCapabilities, packageContentHash, storyboardContentHash, v3Digest } from "../lib/final-video-generation-v3/identity";
import { HiggsfieldVideoGenerationProvider, HIGGSFIELD_V3_PROFILE } from "../lib/final-video-generation-v3/adapters/higgsfield";

export const v3Id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function sealV3(input: PlanningInput): PlanningInput {
  input.storyboard.hash = storyboardContentHash(input.storyboardContent);
  input.package.hash = packageContentHash(input);
  return input;
}
export function v3Input(durations: number[] = [5000, 5000]): PlanningInput {
  const at = "2026-10-29T12:00:00+01:00", hash = "a".repeat(64);
  let startMs = 0;
  const input = planningInputSchema.parse({ workflow: V3_WORKFLOW, profileId: HIGGSFIELD_V3_PROFILE,
    scope: { ownerId: v3Id(1), projectId: v3Id(2), jobId: v3Id(3) },
    provenance: { projectWorkflow: V3_WORKFLOW, originalImageId: v3Id(4), originalImageHash: "b".repeat(64) },
    package: { id: v3Id(5), version: 1, hash, approvedAt: at }, storyboard: { id: v3Id(6), version: 1, hash, approvedAt: at },
    direction: "Kai presents a ceramic cup in the new bright studio.",
    storyboardContent: { version: "director-storyboard-v3", title: "A fresh studio story", concept: "Show the new cup naturally.",
      durationMs: durations.reduce((a, b) => a + b, 0), aspectRatio: "9:16", visualStyle: "Realistic", tone: "Warm",
      voiceIntent: "A relaxed conversational Character voice.", continuity: { identity: "Kai from the new image", appearance: "Preserve Kai's appearance",
        outfit: "Blue jacket", product: "The approved ceramic cup", location: "The fresh bright studio" },
      scenes: durations.map((duration, i) => {
        const start = startMs; startMs += duration;
        return { id: `scene-${i + 1}`, number: i + 1, startMs: start, endMs: startMs,
          purpose: "Present the cup", description: "Kai smiles and shows the cup.",
          actions: [{ startMs: start, endMs: start + Math.min(duration, 900), movement: "Lift the cup", gesture: "Hold its handle", expression: "A relaxed smile" }],
          productInteraction: "Hold the handle", productPosition: "Chest height", camera: { shot: "Medium", angle: "Eye level", framing: "Portrait",
            movement: "Slow push in", zoom: "None", focus: "The cup" }, lighting: { direction: "Left", intensity: "Soft", colors: "Neutral", atmosphere: "Calm" },
          speech: [], audio: { background: { requirement: "optional", description: "Quiet studio ambience", assetId: null },
            effects: { requirement: "none", description: "", assetId: null }, music: { requirement: "none", description: "", assetId: null } },
          transition: { type: i < durations.length - 1 ? "cut" : "none", durationMs: 0 }, transitionNote: "", generationNotes: "Keep the cup unchanged." };
      }) }, references: ["character", "product", "location"].map((role, i) => ({ id: v3Id(10 + i), projectId: v3Id(2), originWorkflow: V3_WORKFLOW,
        kind: "image", role, name: ["Kai", "Cup", "Studio"][i], version: 1, approvalId: v3Id(20 + i), approvalVersion: 1,
        sha256: String(i + 1).repeat(64), sizeBytes: 1000, mimeType: "image/png", durationMs: null })) });
  return sealV3(input);
}
export function v3Context(input: PlanningInput, provider: VideoGenerationProvider = v3Provider()): PlanningContext {
  return { current: structuredClone({ workflow: input.workflow, profileId: input.profileId, scope: input.scope, provenance: input.provenance,
    package: input.package, storyboard: input.storyboard, references: input.references }), now: "2026-10-29T12:10:00+01:00", accountScope: "synthetic-account-v3",
    estimateEvidence: [], authorization: { id: v3Id(30), version: 1, projectId: input.scope.projectId, packageHash: input.package.hash,
      inputFingerprint: v3Digest("input", input), capabilityHash: v3Digest("capabilities", normalizeCapabilities(provider.capabilities())),
      maxRequests: 20, maxCostMicrousd: 100_000_000, consumedRequests: 0, committedCostMicrousd: 0 } };
}
export function v3Provider(mutate?: (cap: ReturnType<HiggsfieldVideoGenerationProvider["capabilities"]>) => void): VideoGenerationProvider {
  const cap = new HiggsfieldVideoGenerationProvider().capabilities();
  cap.providerId = "synthetic-v3-provider";
  for (const key of Object.keys(cap.features) as (keyof typeof cap.features)[]) cap.features[key] = "supported";
  cap.referenceLimits = { total: 30, image: { maxCount: 10, maxBytes: 1_000_000, mimeTypes: ["image/png"], maxDurationMs: null, maxCombinedDurationMs: null },
    audio: { maxCount: 3, maxBytes: 1_000_000, mimeTypes: ["audio/wav"], maxDurationMs: 30000, maxCombinedDurationMs: 30000 },
    video: { maxCount: 3, maxBytes: 1_000_000, mimeTypes: ["video/mp4"], maxDurationMs: 30000, maxCombinedDurationMs: 30000 } };
  mutate?.(cap);
  return { capabilities: () => structuredClone(cap),
    prepareRequest: segment => ({ executable: false, providerId: cap.providerId, profileId: cap.profileId, commandFingerprint: segment.fingerprint }),
    estimateCost: command => ({ status: "estimated", estimatedCostMicrousd: command.direction.durationMs * 10,
    source: "account_estimate", sourceUrl: "https://example.invalid/synthetic-price", pricingVersion: "synthetic-v3", reason: null,
    evidenceHash: "d".repeat(64), actualProviderCostMicrousd: null, providerReceipt: null }) };
}
