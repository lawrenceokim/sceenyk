import { z } from "zod";
import type { V5Workflow } from "@/lib/character-v5/contract";
import type { LocationRow } from "@/lib/location-reference/contract";
import type { StoryboardRow } from "@/lib/storyboard/contract";
import type { PackageRow } from "@/lib/video-generation-package/contract";
import { finalPhases, type FinalExecution } from "@/lib/final-video-generation/contract";

export function compositeRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || input === undefined || Array.isArray(input) && input.length === 0) return null;
  const row = Array.isArray(input) && input.length === 1 ? input[0] : input;
  if (row === null) return null;
  if (row && typeof row === "object" && !Array.isArray(row)) {
    const values = Object.values(row);
    if (values.length && values.every(value => value === null)) return null;
    return row as Record<string, unknown>;
  }
  throw new Error("UGC_CLAIM_CONTRACT_INVALID");
}
const base = z.object({
  id: z.uuid(), job_id: z.uuid(), project_id: z.uuid(), owner_user_id: z.uuid(), worker_id: z.uuid().nullable().optional(),
  version: z.number().int().positive(), claim_token: z.uuid(),
  heartbeat_at: z.iso.datetime({ offset: true }), lease_expires_at: z.iso.datetime({ offset: true }),
});
const schemas = {
  final: base.extend({ state: z.literal("running"), phase: z.enum(finalPhases), package_id: z.uuid(), configuration: z.object({}), package_hash: z.string().regex(/^[a-f0-9]{64}$/) }),
  package: base.extend({ state: z.literal("running"), phase: z.enum(["checking", "building", "validating", "saving"]),
    revision: z.number().int().positive(), input: z.object({}), input_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
    attempts: z.number().int().min(1).max(3), document: z.null(), approved_at: z.null(), stale_at: z.null() }),
  character: base.extend({ state: z.literal("running"), slot: z.enum(["face", "back", "front_source", "front", "sheet"]), candidate_id: z.uuid() }),
  location: base.extend({ state: z.enum(["running_plan", "running_image", "rejecting"]),
    phase: z.enum(["preparing", "generating", "saving", "recovering", "deleting"]),
    candidate_id: z.uuid().nullable(), accepted_candidate_id: z.null(), approved_at: z.null(),
  }).refine(row => row.state === "running_plan" || !!row.candidate_id),
  storyboard: base.extend({ state: z.enum(["running", "deleting"]),
    phase: z.enum(["preparing", "generating", "repairing", "saving", "deleting"]),
    attempts: z.number().int().min(0).max(3), requests: z.array(z.object({ model: z.string().min(1) })).max(2), input: z.object({}),
  }),
};
type Claims = { character: V5Workflow; location: LocationRow; storyboard: StoryboardRow; package: PackageRow; final: FinalExecution };
export class UgcClaimContractError extends Error {
  constructor(readonly queue: keyof Claims, readonly reason: "malformed" | "expired") { super("UGC_CLAIM_CONTRACT_INVALID"); }
}
export function parseWorkerClaim<K extends keyof Claims>(queue: K, input: unknown, now = Date.now()): Claims[K] | null {
  let record;
  try { record = compositeRecord(input); } catch { throw new UgcClaimContractError(queue, "malformed"); }
  if (!record) return null;
  if (!schemas[queue].safeParse(record).success) throw new UgcClaimContractError(queue, "malformed");
  if (Date.parse(String(record.lease_expires_at)) <= now) throw new UgcClaimContractError(queue, "expired");
  return record as unknown as Claims[K];
}
export type LocalExecutionResult = { ok: boolean; category?: "failed" | "lease_lost"; failureSaved?: boolean };
