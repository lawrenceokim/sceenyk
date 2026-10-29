import { videoGenerationPackageSchema, type VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import { segmentPlanningInputSchema, segmentPlanVersion, type SegmentPlanningInput } from "./contract";

// The future server must supply verified package-approval evidence. This pure
// conversion neither looks up ownership/currentness nor grants execution authority.
export function segmentInputFromPackage(value: VideoGenerationPackage, options: {
  packageApproval: SegmentPlanningInput["source"]["packageApproval"]; resolution: string;
  audioReference: SegmentPlanningInput["audioReference"]; requiredCapabilities?: string[];
}): SegmentPlanningInput {
  const doc = videoGenerationPackageSchema.parse(value);
  return segmentPlanningInputSchema.parse({ version: segmentPlanVersion,
    scope: { ownerId: doc.project.ownerId, projectId: doc.project.id, jobId: doc.project.jobId },
    source: { packageHash: doc.packageHash, packageVersion: doc.packageVersion, packageApproval: options.packageApproval,
      storyboard: { id: doc.storyboard.id, version: doc.storyboard.version, revision: doc.storyboard.revision,
        documentHash: doc.storyboard.documentHash, approvedAt: doc.storyboard.approvedAt } },
    durationMs: doc.timeline.totalDurationMs, aspectRatio: doc.output.aspectRatio, resolution: options.resolution,
    visualStyle: doc.project.visualStyle, tone: doc.project.tone, creativeDirection: doc.project.creativeDirection,
    voice: doc.voice, continuity: doc.continuity, scenes: doc.scenes,
    references: Object.entries(doc.approvedReferences).map(([role, ref]) => ({ role, id: ref.id, approvalId: ref.approvalId,
      approvalVersion: ref.approvalVersion, sha256: ref.sha256, mimeType: ref.mimeType,
      sizeBytes: ref.sizeBytes, width: ref.width, height: ref.height })),
    audioReference: options.audioReference, requiredCapabilities: options.requiredCapabilities ?? [],
  });
}
