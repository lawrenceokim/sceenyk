import { validateVideoGenerationPackage } from "./builder";
import type { PackageRow, PackageSummary } from "./contract";

// Explicit owner-safe projection: no source snapshot, keys, checksums, receipts,
// scope IDs, provider payloads or lifecycle/lease records reach the browser.
export function packageSummary(row: PackageRow): PackageSummary | null {
  if (!row.document || row.state === "deleted") return null;
  const data = validateVideoGenerationPackage(row.document, row.input, row.revision);
  return { packageVersion: data.packageVersion, timeline: data.timeline, output: data.output,
    scenes: data.scenes, voice: data.voice, requirements: data.requirements, title: data.project.title,
    visualStyle: data.project.visualStyle, tone: data.project.tone, videoType: data.project.videoType,
    character: data.approvedReferences.character.name, product: data.approvedReferences.product.name,
    location: data.approvedReferences.location.name, storyboardVersion: data.storyboard.version, storyboardRevision: data.storyboard.revision,
    referenceVersions: { character: data.approvedReferences.character.approvalVersion, product: data.approvedReferences.product.approvalVersion,
      location: data.approvedReferences.location.approvalVersion } };
}
