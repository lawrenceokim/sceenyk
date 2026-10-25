import "server-only";
import { headR2CharacterObject } from "@/lib/storage/r2";
import { v5OutputProofSchema, type V5Candidate, type V5Workflow } from "./contract";
import { v5Prefix } from "./storage";

export type V5RecoveryState = "stored" | "provider_result" | "unrecoverable" | "unknown" | "storage_missing" | "not_needed";
// HEAD only. A stored status is availability, never a substitute for the full
// conditional GET/hash/decode verification performed before publication.
export async function v5RecoveryState(workflow: V5Workflow, candidate: V5Candidate): Promise<V5RecoveryState> {
  const key = `${v5Prefix(workflow)}${candidate.id}.png`;
  if (["rejecting", "rejected"].includes(candidate.state)) return "not_needed";
  const proof = v5OutputProofSchema.safeParse(candidate.output_proof);
  if (candidate.planned_key !== key || !proof.success || proof.data.id !== candidate.id) {
    return ["review", "accepted"].includes(candidate.state) ? "storage_missing" : "not_needed";
  }
  let object;
  try { object = await headR2CharacterObject(key, AbortSignal.timeout(10_000)); }
  catch { return "unknown"; }
  if (object) {
    if (!object.etag || object.sizeBytes !== proof.data.sizeBytes || object.mimeType !== proof.data.mimeType ||
      candidate.artifact && candidate.artifact.etag !== object.etag) return "storage_missing";
    return "stored";
  }
  if (["review", "accepted"].includes(candidate.state)) return "storage_missing";
  if (workflow.error_code === "CHARACTER_OUTPUT_UNRECOVERABLE") return "unrecoverable";
  return candidate.request_id && candidate.status_url && !candidate.provider_terminal ? "provider_result" : "unrecoverable";
}
