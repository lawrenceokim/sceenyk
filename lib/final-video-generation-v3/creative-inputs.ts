import "server-only";
import { promises as fs } from "node:fs";
import { createDatabaseClient } from "@/lib/db/server";
import { v3DatabaseFailure } from "./database-errors";
import { v3Digest } from "./identity";
import { generationContext, artifactCurrent, requiredReferenceArtifacts, type ReferenceOriginals } from "./generation-context";
import type { RuntimeWorkspace } from "./runtime-store";
import type { Artifact } from "./runtime-contract";
import { seedanceReferenceLimits } from "./adapters/higgsfield-reference-limits";
import { lockDocument } from "./creative-lock";

export async function validityEvidence() {
  const file = process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
  if (!file) return seedanceReferenceLimits;
  // An explicitly configured account restriction must not silently disappear.
  let bytes;
  try {
    if ((await fs.stat(file)).size > 32768) return { configurationError: "V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID" };
    bytes = await fs.readFile(file, "utf8");
  } catch { return { configurationError: "V3_HIGGSFIELD_REFERENCE_LIMITS_UNAVAILABLE" }; }
  try {
    const evidence: unknown = JSON.parse(bytes);
    return evidence !== null && typeof evidence === "object" && !Array.isArray(evidence) ? evidence : { configurationError: "V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID" };
  }
  catch { return { configurationError: "V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID" }; }
}
export function approvedArtifacts(w: RuntimeWorkspace, brief: Awaited<ReturnType<typeof projectBrief>>, originals: ReferenceOriginals) {
  const snapshot = lockDocument(w);
  if (w.creativeLock) {
    if (!snapshot || !w.creativeLock.valid) throw new Error("V3_LOCKED_INPUTS_NEED_REVIEW");
    return (snapshot.references as { id: string }[]).map(({ id }) => {
      const artifact = w.artifacts.find(a => a.id === id); if (!artifact) throw new Error("V3_LOCKED_INPUTS_DAMAGED"); return artifact;
    });
  }
  if (w.tasks.some(t => ["character", "product", "location", "storyboard"].includes(t.kind) && ["queued", "running", "reconciliation_required"].includes(t.status)))
    throw new Error("V3_CREATIVE_REQUEST_STILL_ACTIVE");
  const required = requiredReferenceArtifacts(w, originals, true);
  if (!required.length || required.some(a => !a)) throw new Error("APPROVE_CURRENT_REFERENCES_FIRST");
  const refs = required.filter((a): a is Artifact => !!a);
  for (const kind of ["character", ...(originals.product ? ["product"] : []), "location"]) {
    const ref = refs.find(a => a.kind === kind);
    if (!ref?.approved_at || ref.rejected_at) throw new Error(`V3_${kind.toUpperCase()}_APPROVAL_REQUIRED`);
  }
  if (!refs.some(a => a.kind === "character") || !refs.some(a => a.kind === "location") || originals.product && !refs.some(a => a.kind === "product") || refs.some(a => !a.approved_at || !artifactCurrent(a, w.artifacts, generationContext(brief), originals, creativeBriefHash(brief), w.referenceDeletions))) throw new Error("APPROVE_CURRENT_REFERENCES_FIRST");
  return refs;
}
export async function referenceOriginals(owner: string, project: string): Promise<ReferenceOriginals> {
  const r = await createDatabaseClient().from("project_assets").select("id,studio_role,reference_name,created_at")
    .eq("owner_user_id", owner).eq("project_id", project).eq("upload_status", "uploaded").eq("removed_from_draft", false).in("studio_role", ["character", "product"]);
  if (r.error) v3DatabaseFailure(r.error, "read_references", r.status);
  if (r.data.filter(a => a.studio_role === "product").length > 1) throw new Error("V3_REFERENCE_LIMIT_EXCEEDED");
  const characters = r.data.filter(a => a.studio_role === "character")
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")) || a.id.localeCompare(b.id))
    .map(a => ({ id: a.id, name: a.reference_name ?? "" }));
  return { character: characters[0]?.id ?? null, product: r.data.find(a => a.studio_role === "product")?.id ?? null,
    ...(characters.length > 1 ? { characters } : {}), names: { character: characters[0]?.name ?? "", product: r.data.find(a => a.studio_role === "product")?.reference_name ?? "",
      ...(characters.length > 1 ? { characters } : {}) } };
}
// Preserve the 077 checkpoint hash recipe. Creation Type is separately frozen in generationContext.
export function creativeBriefHash(brief: Awaited<ReturnType<typeof projectBrief>>) {
  const { creation_type: _creationType, video_resolution: _resolution, ...legacyBrief } = brief;
  void _creationType;
  void _resolution; // Output resolution is not a reference/Storyboard creative dependency.
  return v3Digest("brief", legacyBrief);
}
export async function projectBrief(owner: string, project: string) {
  const r = await createDatabaseClient().from("projects").select("id,title,prompt,aspect_ratio,duration,visual_style,tone,category,ugc_type,creation_type,video_resolution")
    .eq("id", project).eq("owner_user_id", owner).is("deleted_at", null).maybeSingle();
  if (r.error) v3DatabaseFailure(r.error, "read_project", r.status);
  if (!r.data) throw new Error("FRESH_V3_PROJECT_REQUIRED"); return r.data;
}
