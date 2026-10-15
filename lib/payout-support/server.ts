import "server-only";
import { requireAdminOrSupport } from "@/lib/auth/require-admin-or-support";
import { createDatabaseClient } from "@/lib/db/server";
import { beginPayoutCheck, commitPayoutCheck, checkedPayoutData, PayoutCheckError } from "@/lib/marketplace/withdrawals/observations";
import { inspectExistingPayout } from "@/lib/marketplace/withdrawals/reconciliation";
import { queueInput, queueResult, detailInput, detailResult, reconcileInput } from "./contract";
import { missingPayoutReferenceMessage, payoutCheckMessages } from "./outcomes";

export class PayoutSupportInputError extends Error {
  constructor() { super("Invalid payout-support request."); this.name = "PayoutSupportInputError"; }
}
export async function getPayoutSupportQueue(input: unknown) {
  const actor = await requireAdminOrSupport();
  const parsed = queueInput.safeParse(input);
  if (!parsed.success) throw new PayoutSupportInputError();
  const { query, status, page } = parsed.data;
  const result = queueResult.parse(checkedPayoutData(await createDatabaseClient().rpc("payout_support_queue", { p_actor: actor.userId, p_query: query, p_status: status, p_page: page })));
  return { ...result, filters: parsed.data };
}
export async function getPayoutSupportDetail(input: unknown) {
  const actor = await requireAdminOrSupport();
  const parsed = detailInput.safeParse(input);
  if (!parsed.success) throw new PayoutSupportInputError();
  const { id, historyPage, auditPage, allocationPage } = parsed.data;
  const result = detailResult.parse(checkedPayoutData(await createDatabaseClient().rpc("payout_support_detail", { p_actor: actor.userId, p_id: id, p_history_page: historyPage, p_audit_page: auditPage, p_allocation_page: allocationPage })));
  if (!result.found) throw new PayoutCheckError("NOT_FOUND");
  return result;
}
export async function reconcileSupportPayout(input: unknown) {
  const actor = await requireAdminOrSupport();
  const parsed = reconcileInput.safeParse(input);
  if (!parsed.success) throw new PayoutSupportInputError();
  // Begin persists the attempt and reloads authoritative immutable references.
  const check = await beginPayoutCheck(parsed.data.withdrawalId, "support", actor.userId);
  const observation = await inspectExistingPayout(check.withdrawal);
  const result = await commitPayoutCheck(check, observation);
  return {
    status: result.status,
    outcome: result.outcome,
    message: result.reason === "provider_reference_missing" ? missingPayoutReferenceMessage : payoutCheckMessages[result.outcome],
  };
}
