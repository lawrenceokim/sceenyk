import "server-only";
import { promises as fs } from "node:fs";
import { createDatabaseClient } from "@/lib/db/server";
import { v3Digest } from "./identity";
import { generationContext, artifactCurrent, latestArtifact, type ReferenceOriginals } from "./generation-context";
import type { RuntimeWorkspace } from "./runtime-store";
import type { Artifact } from "./runtime-contract";

export async function validityEvidence() {
  const file = process.env.UGC_V3_HIGGSFIELD_LIMITS_FILE;
  if (!file) return null;
  try { if ((await fs.stat(file)).size > 32768) return null; return JSON.parse(await fs.readFile(file, "utf8")) as unknown; } catch { return null; }
}
export function approvedArtifacts(w: RuntimeWorkspace, brief: Awaited<ReturnType<typeof projectBrief>>, originals: ReferenceOriginals) {
  if (w.tasks.some(t => ["character", "product", "location", "storyboard"].includes(t.kind) && ["queued", "running", "reconciliation_required"].includes(t.status)))
    throw new Error("V3_CREATIVE_REQUEST_STILL_ACTIVE");
  const refs = [latestArtifact(w, "character"), ...(originals.product ? [latestArtifact(w, "product")] : []), latestArtifact(w, "location")].filter((a): a is Artifact => !!a);
  for (const kind of ["character", ...(originals.product ? ["product"] : []), "location"]) {
    const ref = refs.find(a => a.kind === kind);
    if (!ref?.approved_at || ref.rejected_at) throw new Error(`V3_${kind.toUpperCase()}_APPROVAL_REQUIRED`);
  }
  if (!refs.some(a => a.kind === "character") || !refs.some(a => a.kind === "location") || originals.product && !refs.some(a => a.kind === "product") || refs.some(a => !a.approved_at || !artifactCurrent(a, w.artifacts, generationContext(brief), originals, creativeBriefHash(brief), w.referenceDeletions))) throw new Error("APPROVE_CURRENT_REFERENCES_FIRST");
  return refs;
}
export async function referenceOriginals(owner: string, project: string): Promise<ReferenceOriginals> {
  const r = await createDatabaseClient().from("project_assets").select("id,studio_role,reference_name")
    .eq("owner_user_id", owner).eq("project_id", project).eq("upload_status", "uploaded").eq("removed_from_draft", false).in("studio_role", ["character", "product"]);
  if (r.error) throw new Error("V3_REFERENCES_UNAVAILABLE");
  if (["character", "product"].some(kind => r.data.filter(a => a.studio_role === kind).length > 1)) throw new Error("V3_REFERENCE_LIMIT_EXCEEDED");
  return { character: r.data.find(a => a.studio_role === "character")?.id ?? null, product: r.data.find(a => a.studio_role === "product")?.id ?? null, names: { character: r.data.find(a => a.studio_role === "character")?.reference_name ?? "", product: r.data.find(a => a.studio_role === "product")?.reference_name ?? "" } };
}
// Preserve the 077 checkpoint hash recipe. Creation Type is separately frozen in generationContext.
export function creativeBriefHash(brief: Awaited<ReturnType<typeof projectBrief>>) {
  const { creation_type: _creationType, ...legacyBrief } = brief;
  void _creationType;
  return v3Digest("brief", legacyBrief);
}
export async function projectBrief(owner: string, project: string) {
  const r = await createDatabaseClient().from("projects").select("id,title,prompt,aspect_ratio,duration,visual_style,tone,category,ugc_type,creation_type")
    .eq("id", project).eq("owner_user_id", owner).is("deleted_at", null).maybeSingle();
  if (r.error || !r.data) throw new Error("FRESH_V3_PROJECT_REQUIRED"); return r.data;
}
