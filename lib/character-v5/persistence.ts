import "server-only";
import { createDatabaseClient } from "@/lib/db/server";
import { v5ArtifactSchema, v5OutputProofSchema, CharacterV5Error, type V5Candidate, type V5Workflow } from "./contract";
import { v5DatabaseError } from "./database-diagnostics";
import { v5Prefix } from "./storage";
import { logV5Back } from "./back-diagnostics";

// A candidate is preallocated before spending. Publication updates that same
// row; a lost reply never authorizes a new row, object key or provider request.
export async function readbackV5Candidate(workflow: V5Workflow, id: string) {
  const result = await createDatabaseClient().from("ugc_character_v5_candidates").select("*").eq("id", id).eq("workflow_id", workflow.id).single();
  if (result.error || !result.data) throw v5DatabaseError(result.error, { operation: "candidate_readback", phase: "candidate_readback",
    slot: workflow.slot, version: workflow.version, table: "ugc_character_v5_candidates" });
  const candidate = result.data;
  const asset = v5ArtifactSchema.safeParse(candidate.artifact);
  const proof = v5OutputProofSchema.safeParse(candidate.output_proof);
  if (!["review", "accepted"].includes(candidate.state) || candidate.slot !== workflow.slot || !asset.success || asset.data.id !== id ||
    !proof.success || proof.data.id !== id || proof.data.sha256 !== asset.data.sha256 || proof.data.sizeBytes !== asset.data.sizeBytes ||
    proof.data.width !== asset.data.width || proof.data.height !== asset.data.height || proof.data.mimeType !== asset.data.mimeType ||
    asset.data.storageKey !== `${v5Prefix(workflow)}${id}.png`) throw new CharacterV5Error("candidate_readback", "CHARACTER_CANDIDATE_READBACK_INVALID",
      { operation: "candidate_readback", category: "database_failure", table: "ugc_character_v5_candidates", slot: workflow.slot,
        version: workflow.version, safeReason: "Saved candidate state or artifact metadata does not match the expected candidate." });
  logV5Back("saved", candidate as V5Candidate);
  return candidate as V5Candidate;
}
