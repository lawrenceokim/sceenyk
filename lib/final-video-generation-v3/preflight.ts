import "server-only";
import { z } from "zod";
import type { VideoGenerationProvider } from "./contract";
import { authorizationIssues } from "./authorization";
import { capabilityIssues } from "./validation";
import { normalizeCapabilities, v3Digest } from "./identity";
import { localV3Profile, packageCost, packageCurrentness, readFrozenPackage, restoreSegment } from "./package";
import { HiggsfieldVideoGenerationProvider, higgsfieldModels, inspectHiggsfieldPayload } from "./adapters/higgsfield";
import { executionSchema } from "./recovery";

// Pure inspection: no env, database, credentials, provider HTTP or signed URL creation.
export function inspectV3Package(value: unknown, options: { currentInput: unknown; sourceRevision: number; now: string;
  sourceCurrent?: boolean; deliveryMedia?: unknown; authorization?: unknown; execution?: unknown }, provider: VideoGenerationProvider = new HiggsfieldVideoGenerationProvider()) {
  const doc = readFrozenPackage(value), current = options.sourceCurrent !== false && packageCurrentness(doc, options.currentInput, options.sourceRevision);
  const cost = packageCost(doc, provider, options.now), model = higgsfieldModels[doc.source.mode];
  const authority = authorizationIssues(doc, options.authorization, options.now, model);
  const issues = capabilityIssues(doc.source, provider.capabilities()).map(i => i.code);
  const currentCapabilities = provider.capabilities(), capabilityMatches = v3Digest("capabilities", normalizeCapabilities(currentCapabilities)) === doc.capabilityHash;
  if (!capabilityMatches) issues.push("PROVIDER_SNAPSHOT_CHANGED");
  if (!current) issues.push("PACKAGE_STALE");
  if (cost.code) issues.push(cost.code);
  issues.push(...authority, "PAID_V3_EXECUTION_DISABLED");
  const state = options.execution === undefined ? null : executionSchema.parse(options.execution);
  if (state && (state.packageId !== doc.id || state.packageHash !== doc.hash)) throw new Error("EXECUTION_PACKAGE_MISMATCH");
  return { profile: localV3Profile, projectId: doc.source.scope.projectId, packageId: doc.id, packageVersion: doc.version,
    packageHash: doc.hash, sourceRevision: doc.sourceRevision, currentness: current ? "current" : "stale", state: state?.state ?? "package_ready",
    segmentCount: doc.segments.length, composition: doc.composition,
    resolution: currentCapabilities.supportedResolutions.includes(doc.source.resolution) ? doc.source.resolution : "[unsupported]",
    aspectRatio: currentCapabilities.supportedAspectRatios.includes(doc.source.storyboardContent.aspectRatio) ? doc.source.storyboardContent.aspectRatio : "[unsupported]",
    nativeAudio: doc.source.generateAudio, capabilities: { snapshotHash: doc.capabilityHash, matchesCurrentProvider: capabilityMatches, current: currentCapabilities },
    estimatedCostMicrousd: cost.totalMicrousd, authorizationState: authority.length ? "missing_or_invalid" : "bound_operator_approval",
    actualProviderCosts: state?.segments.flatMap(s => s.attempts.map(a => ({ segmentId: s.id, attemptId: a.id,
      costMicrousd: a.result?.actualCostMicrousd ?? null, receiptHash: a.result?.receiptHash ?? null }))) ?? [],
    segments: doc.segments.map(s => {
      const segment = restoreSegment(doc, s.id), media = options.deliveryMedia === undefined
        ? new Map(segment.command.references.map(r => [r.id, `https://media.invalid/${r.id}`]))
        : new Map(Object.entries(z.record(z.uuid(), z.string()).parse(options.deliveryMedia)));
      let payload: ReturnType<typeof inspectHiggsfieldPayload> | null = null;
      try { payload = inspectHiggsfieldPayload(segment, media); } catch { issues.push("HIGGSFIELD_PAYLOAD_UNAVAILABLE"); }
      return { id: s.id, fingerprint: s.fingerprint, durationMs: s.durationMs, sceneNumbers: s.includedSceneNumbers,
        references: segment.command.references.map(r => ({ id: r.id, role: r.role, version: r.version, approvalId: r.approvalId, sha256: r.sha256 })),
        compiledPrompt: { characters: s.compiledPrompt.length, hash: v3Digest("director-prompt", s.compiledPrompt),
          shotCount: segment.command.direction.shots.length, dialogueLineCount: segment.command.direction.dialogue.length },
        payload, payloadUsesInspectionPlaceholders: options.deliveryMedia === undefined, estimatedCostMicrousd: s.estimate.estimatedCostMicrousd };
    }), eligibleForPaidSubmission: false as const, issues: [...new Set(issues)] };
}
