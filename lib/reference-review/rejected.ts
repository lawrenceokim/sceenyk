import "server-only";
import { createHash } from "node:crypto";
import { characterSheetDocumentSchema, operationSchema, type CharacterOperation, type CharacterView } from "@/lib/character-sheet/contract";
import type { ReferenceRegenerationRow, ReferenceReviewRow } from "./contract";

type Scope = { id: string; owner_user_id: string; project_id: string };
export type RejectedCandidate = { id: string; view: CharacterView; reasons: string[]; stage: "provider" | "reference";
  storageKey: string; sha256: string };

// Return private paths only to server callers. The DTO maps explicit safe fields.
// Client-supplied IDs are opaque selectors, never object keys or provider IDs.
export function rejectedCharacterCandidates(job: Scope, row: { id: string; sheet_version: number; document: unknown } | null,
  review: ReferenceReviewRow | undefined, requests: ReferenceRegenerationRow[]) {
  const candidates: RejectedCandidate[] = [];
  const add = (view: CharacterView, op: CharacterOperation, prefix: string) => {
    const failure = op.validation?.state === "rejected" ? op.validation : op.sourceValidation?.state === "rejected" ? op.sourceValidation : undefined;
    const cropFailed = op.diagnostic?.reason === "CHARACTER_FRONT_CROP_INVALID";
    if (!failure && !cropFailed) return;
    const reasons = failure?.reasons ?? ["CHARACTER_FRONT_CROP_INVALID"];
    const provider = op.sourceValidation ?? op.validation;
    if (!provider) return;
    const entry = (stage: "provider" | "reference", sha256: string) => {
      const suffix = stage === "reference" ? "-reference" : "";
      const storageKey = `${prefix}/candidates/${view}/${op.key}${suffix}.png`;
      const id = createHash("sha256").update(storageKey).digest("hex");
      candidates.push({ id, view, reasons, stage, storageKey, sha256 });
    };
    entry("provider", provider.sha256);
    if (view === "front" && op.generation?.outputRole === "front_source" && failure?.stage === "canonical") entry("reference", failure.sha256);
  };
  if (review) for (const request of [...requests].filter(item => item.review_id === review.id).sort((a, b) => b.requested_version - a.requested_version)) {
    if (!["front", "back", "face"].includes(request.view)) continue;
    const parsed = operationSchema.safeParse(request.checkpoint);
    if (!parsed.success) continue;
    for (const op of [parsed.data, ...[...(parsed.data.previousAttempts ?? [])].reverse()]) {
      const version = op.requestedVersion ?? request.requested_version;
      add(request.view as CharacterView, op, `ugc/${job.owner_user_id}/${job.project_id}/${job.id}/reference-review-v1/${review.id}/v${version}`);
    }
  }
  const base = characterSheetDocumentSchema.safeParse(row?.document);
  if (row && base.success) for (const view of ["front", "back", "face"] as const) {
    const op = base.data.operations[view];
    if (!op) continue;
    for (const attempt of [op, ...[...(op.previousAttempts ?? [])].reverse()]) add(view, attempt,
      `ugc/${job.owner_user_id}/${job.project_id}/${job.id}/character-v${row.sheet_version}/${row.id}`);
  }
  return candidates.filter((candidate, index) => candidates.findIndex(item => item.id === candidate.id) === index).slice(0, 18);
}
