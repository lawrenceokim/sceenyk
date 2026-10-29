import "server-only";
import { z } from "zod";
import { capabilitiesSchema, costEstimateSchema, digestSchema, estimateEvidenceSchema, planningInputSchema,
  type GenerationSegment, type PlanningContext, type VideoGenerationProvider } from "./contract";
import { commandFingerprint, freezeDocument, normalizeCapabilities, v3Digest } from "./identity";
import { planGenerationSegments } from "./planner";
import { compileDirectorInstructions } from "./compiler";

export const localV3Profile = Object.freeze({ id: "v3-local-480p-preflight", resolution: "480p",
  workflowEnabled: true, planningOnly: true, paidTransportEnabled: false } as const);
const storedSegmentSchema = z.strictObject({ id: z.string().min(1), version: z.literal(1), startMs: z.number().int().nonnegative(),
  endMs: z.number().int().positive(), durationMs: z.number().int().positive(), includedSceneNumbers: z.array(z.number().int().positive()).min(1),
  capabilityHash: digestSchema, fingerprint: digestSchema, estimate: costEstimateSchema, compiledPrompt: z.string().min(1),
  // Commands/direction are reconstructed from the frozen approved source, never cast from JSON.
});
export const frozenPackageSchema = z.strictObject({ schema: z.literal("generation-package-v3.2"), id: z.uuid(), version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }), sourceRevision: z.number().int().positive(), source: planningInputSchema,
  inputHash: digestSchema, capabilitySnapshot: capabilitiesSchema, capabilityHash: digestSchema,
  segments: z.array(storedSegmentSchema).min(1).max(100), estimateEvidence: z.array(estimateEvidenceSchema), accountScope: z.string().min(1).max(2000),
  pricing: z.strictObject({ status: z.enum(["estimated", "unavailable"]), totalMicrousd: z.number().int().nonnegative().safe().nullable(),
    estimatedAt: z.iso.datetime({ offset: true }), expiresAt: z.iso.datetime({ offset: true }).nullable() }),
  composition: z.enum(["direct_final_review", "review_segments_then_join"]), hash: digestSchema });
export type FrozenPackage = z.infer<typeof frozenPackageSchema>;

export function buildFrozenPackage(input: unknown, provider: VideoGenerationProvider, context: PlanningContext,
  identity: { id: string; version: number; sourceRevision: number }): FrozenPackage {
  const result = planGenerationSegments(input, provider, context);
  if (!result.ok) throw new Error(result.issues.map(i => i.code).join(","));
  const source = planningInputSchema.parse(input), plan = result.plan;
  let total = 0, expiresAt: string | null = null, available = true;
  for (const segment of plan.segments) {
    if (segment.estimate.status !== "estimated" || segment.estimate.estimatedCostMicrousd === null) { available = false; continue; }
    total += segment.estimate.estimatedCostMicrousd;
    const matching = context.estimateEvidence.filter(e => v3Digest("estimate-evidence", e) === segment.estimate.evidenceHash);
    if (matching.length !== 1) { available = false; continue; }
    const expiry = matching[0].expiresAt;
    if (!expiresAt || Date.parse(expiry) < Date.parse(expiresAt)) expiresAt = expiry;
  }
  if (!Number.isSafeInteger(total)) available = false;
  const body = { schema: "generation-package-v3.2" as const, ...identity, createdAt: context.now, source,
    inputHash: v3Digest("input", source), capabilitySnapshot: plan.capabilitySnapshot, capabilityHash: plan.capabilityHash,
    segments: plan.segments.map(segment => ({ id: segment.id, version: segment.version, startMs: segment.startMs, endMs: segment.endMs,
      durationMs: segment.durationMs, includedSceneNumbers: segment.includedSceneNumbers, capabilityHash: segment.capabilityHash,
      fingerprint: segment.fingerprint, estimate: segment.estimate, compiledPrompt: segment.command.direction.prompt })),
    estimateEvidence: structuredClone(context.estimateEvidence), accountScope: context.accountScope,
    pricing: { status: available ? "estimated" as const : "unavailable" as const, totalMicrousd: available ? total : null,
      estimatedAt: context.now, expiresAt: available ? expiresAt : null }, composition: plan.composition };
  return freezeDocument(frozenPackageSchema.parse({ ...body, hash: v3Digest("frozen-package", body) }));
}

export function readFrozenPackage(value: unknown): FrozenPackage {
  const doc = frozenPackageSchema.parse(value), { hash, ...body } = doc;
  if (hash !== v3Digest("frozen-package", body) || doc.inputHash !== v3Digest("input", doc.source) ||
    doc.capabilityHash !== v3Digest("capabilities", normalizeCapabilities(doc.capabilitySnapshot))) throw new Error("PACKAGE_INTEGRITY_INVALID");
  let end = 0, scene = 1;
  for (const [index, segment] of doc.segments.entries()) {
    const command = restoreSegment(doc, segment.id).command;
    if (segment.id !== `segment-${index + 1}-${segment.fingerprint.slice(0, 16)}` ||
      segment.startMs !== end || segment.endMs - segment.startMs !== segment.durationMs || segment.capabilityHash !== doc.capabilityHash ||
      segment.fingerprint !== commandFingerprint(command) || segment.compiledPrompt !== command.direction.prompt ||
      segment.includedSceneNumbers.some(n => n !== scene++)) throw new Error("SEGMENT_INTEGRITY_INVALID");
    end = segment.endMs;
  }
  if (end !== doc.source.storyboardContent.durationMs || scene !== doc.source.storyboardContent.scenes.length + 1 ||
    doc.composition !== (doc.segments.length === 1 ? "direct_final_review" : "review_segments_then_join")) throw new Error("PACKAGE_PLAN_INVALID");
  return freezeDocument(doc);
}

export function restoreSegment(doc: FrozenPackage, segmentId: string): GenerationSegment {
  const segment = doc.segments.find(s => s.id === segmentId);
  if (!segment) throw new Error("SEGMENT_NOT_FOUND");
  const direction = compileDirectorInstructions(doc.source, segment.includedSceneNumbers[0] - 1, segment.includedSceneNumbers.at(-1)!);
  const input = doc.source;
  return { ...segment, executionStatus: "not_started", actualProviderCostMicrousd: null, providerReceipt: null,
    command: { workflow: input.workflow, profileId: input.profileId, scope: input.scope, package: input.package, storyboard: input.storyboard,
      provenance: input.provenance, capabilityHash: doc.capabilityHash, mode: input.mode, aspectRatio: input.storyboardContent.aspectRatio,
      resolution: input.resolution, format: input.format, generateAudio: input.generateAudio, references: input.references, direction } };
}

export function packageCurrentness(doc: FrozenPackage, current: unknown, sourceRevision: number) {
  return sourceRevision === doc.sourceRevision && v3Digest("input", planningInputSchema.parse(current)) === doc.inputHash;
}

export function packageCost(doc: FrozenPackage, provider: VideoGenerationProvider, now: string) {
  let total = 0;
  for (const segment of doc.segments) {
    const estimate = provider.estimateCost(restoreSegment(doc, segment.id).command, doc.estimateEvidence, doc.accountScope, now);
    if (estimate.status !== "estimated" || estimate.estimatedCostMicrousd === null || estimate.evidenceHash !== segment.estimate.evidenceHash ||
      estimate.estimatedCostMicrousd !== segment.estimate.estimatedCostMicrousd) return { code: "COST_ESTIMATE_UNAVAILABLE", totalMicrousd: null } as const;
    total += estimate.estimatedCostMicrousd;
  }
  if (!Number.isSafeInteger(total) || doc.pricing.status !== "estimated" || total !== doc.pricing.totalMicrousd ||
    !doc.pricing.expiresAt || Date.parse(doc.pricing.expiresAt) <= Date.parse(now) || Date.parse(doc.pricing.estimatedAt) > Date.parse(now))
    return { code: "COST_ESTIMATE_UNAVAILABLE", totalMicrousd: null } as const;
  return { code: null, totalMicrousd: total } as const;
}
