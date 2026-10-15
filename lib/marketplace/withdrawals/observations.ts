import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { withdrawalRowSchema } from "./contract";
import type { PayoutObservation } from "./reconciliation";

export class PayoutCheckError extends Error {
  constructor(readonly code: "ACCESS_DENIED" | "UNAVAILABLE" | "NOT_FOUND") {
    super("Payout status check is unavailable.");
    this.name = "PayoutCheckError";
  }
}
export function checkedPayoutData<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) {
    const denied = typeof result.error === "object" && "code" in result.error && result.error.code === "42501";
    throw new PayoutCheckError(denied ? "ACCESS_DENIED" : "UNAVAILABLE");
  }
  if (result.data === null) throw new PayoutCheckError("UNAVAILABLE");
  return result.data;
}
export async function beginPayoutCheck(id: string, source: "support" | "worker" | "webhook", actor: string | null = null, submission = false) {
  const attempt = randomUUID();
  const data = checkedPayoutData(await createDatabaseClient().rpc("payout_support_check_begin", { p_id: id, p_attempt: attempt, p_source: source, p_actor: actor, p_submission: submission }));
  const result = z.object({ found: z.boolean(), withdrawal: z.unknown() }).parse(data);
  if (!result.found) throw new PayoutCheckError("NOT_FOUND");
  return { attempt, actor, withdrawal: withdrawalRowSchema.parse(result.withdrawal) };
}
const committed = z.discriminatedUnion("denied", [
  z.object({ denied: z.literal(true) }),
  z.object({ denied: z.literal(false), status: z.enum(["pending", "eligible", "processing", "paid", "failed"]), outcome: z.enum(["paid", "processing", "definitive_failure", "needs_review", "provider_unavailable", "not_submitted"]), reason: z.string() }),
]);
export async function commitPayoutCheck(check: { attempt: string; actor: string | null }, observation: PayoutObservation) {
  const data = checkedPayoutData(await createDatabaseClient().rpc("payout_support_check_finish", {
    p_attempt: check.attempt, p_actor: check.actor, p_batch: observation.batchId, p_item: observation.itemId,
    p_status: observation.providerStatus, p_outcome: observation.outcome, p_reason: observation.reason, p_apply: observation.apply,
  }));
  const result = committed.parse(data);
  if (result.denied) throw new PayoutCheckError("ACCESS_DENIED");
  return result;
}
