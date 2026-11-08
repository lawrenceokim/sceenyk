import "server-only";
import { freezeDocument, v3Digest } from "./identity";
import { lockedBriefSchema, type CreativeLockSummary } from "./creative-lock-contract";
import type { RuntimeWorkspace } from "./runtime-store";
import type { Artifact } from "./runtime-contract";
import type { ReferenceOriginals } from "./generation-context";

const verifiedDocuments = new WeakMap<object, Record<string, unknown> | null>();
export function lockDocument(w: RuntimeWorkspace) {
  if (verifiedDocuments.has(w)) return verifiedDocuments.get(w)!;
  const row = w.creativeLock;
  const doc = row?.state === "locked" && row.snapshot_hash === v3Digest("creative-lock-v1", row.document) ? freezeDocument(row.document) : null;
  verifiedDocuments.set(w, doc); return doc;
}
export function creativeLockSummary(w: RuntimeWorkspace): CreativeLockSummary | null {
  const row = w.creativeLock, doc = lockDocument(w);
  if (!row) return w.runs.some(r => r.state === "approved") && (w.project.studio_mode === "pro" || w.packages.some(p =>
    (p.document as { source?: { storyboardContent?: { version?: string } } })?.source?.storyboardContent?.version === "director-storyboard-connected-v1"))
    ? { state: "setup_required", packageId: null, capturedAt: null, firstApprovedAt: null, originalIds: [], referenceIds: [] } : null;
  const brief = lockedBriefSchema.safeParse(doc?.brief);
  const originals = Array.isArray(doc?.originals) ? doc.originals as { id: string }[] : [];
  const refs = Array.isArray(doc?.references) ? doc.references as { id: string }[] : [];
  const namedRefs = Array.isArray(doc?.references) ? doc.references as { document: { original?: { id: string }; input?: { referenceSubject?: { name: string } } } }[] : [];
  const originalNames = Object.fromEntries(namedRefs.filter(r => r.document.original?.id && r.document.input?.referenceSubject?.name).map(r => [r.document.original!.id, r.document.input!.referenceSubject!.name]));
  const approved = Array.isArray(doc?.approvedRuns) ? doc.approvedRuns as { completedAt?: string | null }[] : [];
  return { state: row.state === "needs_review" ? "needs_review" : row.valid && doc ? "locked" : "damaged", packageId: row.package_id,
    capturedAt: row.captured_at, firstApprovedAt: approved[0]?.completedAt ?? null, ...(brief.success ? { brief: brief.data } : {}), originalNames,
    originalIds: originals.map(a => a.id), referenceIds: [...refs.map(a => a.id), ...((doc?.storyboard as { id?: string } | undefined)?.id ? [(doc!.storyboard as { id: string }).id] : [])] };
}
export function lockedArtifactCurrent(w: RuntimeWorkspace, artifact: Artifact): boolean | null {
  if (!w.creativeLock) return null;
  return w.creativeLock.valid && !!creativeLockSummary(w)?.referenceIds.includes(artifact.id);
}
export function lockedOriginals(w: RuntimeWorkspace, current: ReferenceOriginals): ReferenceOriginals {
  const doc = lockDocument(w); if (!doc) return current;
  const originals = doc.originals as { id: string; studio_role: string; reference_name?: string | null }[];
  const refs = doc.references as { document: { original?: { id: string }; input?: { referenceSubject?: { name: string } } } }[];
  const characters = originals.filter(a => a.studio_role === "character").map(a => ({ id: a.id,
    name: refs.find(r => r.document.original?.id === a.id)?.document.input?.referenceSubject?.name ?? a.reference_name ?? "" }));
  const product = originals.find(a => a.studio_role === "product");
  return { character: characters[0]?.id ?? null, product: product?.id ?? null, ...(characters.length > 1 ? { characters } : {}),
    names: { character: characters[0]?.name ?? "", product: product?.reference_name ?? "", ...(characters.length > 1 ? { characters } : {}) } };
}
