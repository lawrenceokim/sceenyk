import "server-only";
import { z } from "zod";
import type { ReferenceReviewRow } from "./contract";
import { createDatabaseClient } from "@/lib/db/server";
import { UgcWorkerDatabaseError } from "@/lib/ugc-jobs/database-diagnostics";

const claimSchema = z.object({
  id: z.uuid(), job_id: z.uuid(), owner_user_id: z.uuid(), project_id: z.uuid(),
  reference_type: z.enum(["character", "product"]), execution_token: z.uuid(), execution_state: z.literal("running"),
  version: z.number().int().positive(), composed_version: z.number().int().positive(),
  lease_expires_at: z.iso.datetime({ offset: true }),
});

// PostgREST can project SQL NULL composite results as a record of NULL fields.
// Neither that record nor [] is a claim. Validate before starting any execution.
export function parseReferenceRegenerationClaim(input: unknown): ReferenceReviewRow | null {
  if (input === null || Array.isArray(input) && input.length === 0) return null;
  const value = Array.isArray(input) && input.length === 1 ? input[0] : input;
  if (value === null) return null;
  if (value && typeof value === "object" && !Array.isArray(value) && Object.values(value).length > 0 && Object.values(value).every(item => item === null)) return null;
  if (!claimSchema.safeParse(value).success) throw new Error("UGC_REGENERATION_CLAIM_INVALID");
  return value as ReferenceReviewRow;
}

export async function claimReferenceRegeneration(workerId: string, productEnabled: boolean) {
  let response;
  try {
    response = await createDatabaseClient().rpc("ugc_claim_reference_regeneration", { p_worker_id: workerId, p_product_enabled: productEnabled });
  } catch (error) { throw new UgcWorkerDatabaseError(error, "regeneration_claim"); }
  if (response.error) throw new UgcWorkerDatabaseError(response.error, "regeneration_claim", response.status);
  return parseReferenceRegenerationClaim(response.data);
}
