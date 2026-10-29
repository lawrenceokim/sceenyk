import { z } from "zod";
import { packageSceneSchema } from "@/lib/video-generation-package/contract";
import type { SegmentCapabilities, SegmentCostEstimate, SegmentPlanningIssue } from "./capabilities";

export const segmentPlanVersion = "ugc-final-v2-foundation" as const;
const ms = z.number().int().min(0).max(600_000);
const positive = z.number().int().positive();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const approval = z.strictObject({ id: z.uuid(), version: positive, approvedAt: z.iso.datetime({ offset: true }) });
export const segmentReferenceSchema = z.strictObject({ role: z.enum(["character", "product", "location"]), id: z.uuid(),
  approvalId: z.uuid(), approvalVersion: positive, sha256: hash, mimeType: z.string().min(1),
  sizeBytes: positive, width: positive, height: positive });
// Reuse creative field schemas; widen only this separate planning envelope's time/scene bounds.
// This does not change today's 5/10/30s project options or V1 schemas/validators.
export const segmentSceneSchema = packageSceneSchema.extend({ id: z.string().min(1).max(120), number: positive.max(100),
  startMs: ms, endMs: ms, durationMs: positive.max(600_000),
  actions: z.array(packageSceneSchema.shape.actions.element.extend({ startMs: ms, endMs: ms })).min(1).max(8),
  speech: z.array(packageSceneSchema.shape.speech.element.extend({ startMs: ms, endMs: ms })).max(8),
});
export const intendedAudioSchema = z.strictObject({ timelineId: z.string().min(1).max(160), version: positive,
  timingFingerprint: hash, durationMs: positive.max(600_000), mimeType: z.string().min(1),
  // Unknown until the local master/slice is built and measured. This is never a runnable request.
  expectedSliceSizeBytes: positive.nullable(),
  asset: z.strictObject({ id: z.uuid(), version: positive, sha256: hash }).nullable(),
});
export const segmentPlanningInputSchema = z.strictObject({ version: z.literal(segmentPlanVersion),
  scope: z.strictObject({ ownerId: z.uuid(), projectId: z.uuid(), jobId: z.uuid() }),
  source: z.strictObject({ packageHash: hash, packageVersion: positive, packageApproval: approval,
    storyboard: approval.extend({ revision: positive, documentHash: hash }) }),
  durationMs: positive.max(600_000), aspectRatio: z.string().min(1), resolution: z.string().min(1),
  visualStyle: z.string().min(1), tone: z.string().min(1), creativeDirection: z.string().min(1),
  voice: packageSceneSchema.shape.voice, continuity: z.record(z.string(), z.string()),
  references: z.array(segmentReferenceSchema).min(3).max(100), scenes: z.array(segmentSceneSchema).min(1).max(100),
  audioReference: intendedAudioSchema.nullable(), requiredCapabilities: z.array(z.string().min(1)).max(20),
});
export type SegmentPlanningInput = z.infer<typeof segmentPlanningInputSchema>;
export type SegmentScene = z.infer<typeof segmentSceneSchema>;
export type DialogueTimingReference = { id: string; sceneNumber: number; speechIndex: number; textHash: string;
  startMs: number; endMs: number; localStartMs: number; localEndMs: number; speaker: "character" | "narration" };
export type GenerationSegment = {
  id: string; version: 1; startMs: number; endMs: number; durationMs: number; includedSceneNumbers: number[];
  // Exact cloned creative scenes retain action, camera, lighting, style, dialogue and transition intent.
  scenes: SegmentScene[]; dialogue: DialogueTimingReference[];
  shotChanges: { fromSceneNumber: number; toSceneNumber: number | null; atMs: number; localAtMs: number;
    transition: SegmentScene["transition"]; owner: "video" | "composition" }[];
  requiredReferences: SegmentPlanningInput["references"];
  audioReference: (NonNullable<SegmentPlanningInput["audioReference"]> & { sliceStartMs: number; sliceEndMs: number; sliceDurationMs: number }) | null;
  instructions: string; capabilityHash: string; fingerprint: string; estimate: SegmentCostEstimate;
};
export type GenerationSegmentPlan = {
  version: typeof segmentPlanVersion; executable: false; capabilitySnapshot: SegmentCapabilities; capabilityHash: string;
  scope: SegmentPlanningInput["scope"]; source: SegmentPlanningInput["source"];
  inputFingerprint: string; fingerprint: string; segments: GenerationSegment[];
};
export type SegmentPlanningResult = { ok: true; plan: GenerationSegmentPlan } | { ok: false; issues: SegmentPlanningIssue[] };
