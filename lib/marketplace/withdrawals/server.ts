import "server-only";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { getPayPalConfig } from "@/lib/payments/paypal/config";
import { reconcileMarketplaceFinancials } from "../earnings/server";
import { payoutEmail, withdrawalInput, withdrawalRowSchema, payoutWebhookEvents, type WithdrawalRow } from "./contract";
import { creatorWithdrawalAccount } from "./creator-account";
import { assertPayoutWebhooksReady, PayoutRejected, readPayoutBatch, submitPayout, verifyPayout, type PayoutBatch } from "./paypal";

function checked<T>(r: { data: T | null; error: unknown }): T {
  if (r.error || r.data === null) throw new Error("CREATOR_WITHDRAWAL_UNAVAILABLE");
  return r.data;
}
export async function getWithdrawalAccount(page = 1) {
  const user = await ensureAppUser();
  z.number().int().min(1).max(100000).parse(page);
  const data = checked(await createDatabaseClient().rpc("creator_payout_account", { p_creator: user.id, p_page: page }));
  return { clerkUserId: user.clerk_user_id, account: creatorWithdrawalAccount(data) };
}
export async function savePayoutDestination(input: unknown) {
  const user = await ensureAppUser();
  const { email } = z.strictObject({ email: payoutEmail }).parse(input);
  checked(await createDatabaseClient().rpc("creator_payout_destination", { p_creator: user.id, p_email: email }));
}
export async function requestWithdrawal(input: unknown) {
  const user = await ensureAppUser();
  const { requestId, amountMinor } = withdrawalInput.parse(input);
  return z.uuid().parse(checked(await createDatabaseClient().rpc("creator_payout_request", { p_creator: user.id, p_request: requestId, p_amount: amountMinor })));
}
async function loadWithdrawal(id: string) {
  return withdrawalRowSchema.parse(checked(await createDatabaseClient().from("creator_withdrawals").select("*").eq("id", z.uuid().parse(id)).maybeSingle()));
}
async function observe(w: WithdrawalRow, batch: PayoutBatch, submitted = false) {
  const item = verifyPayout(w, batch);
  // Batch SUCCESS does not establish item success. Terminal batch DENIED is
  // authoritative only after matching our one-item instruction by provider GET.
  const status = item?.transaction_status ?? (!submitted && batch.batch_header.batch_status === "DENIED" ? "DENIED" : `BATCH_${batch.batch_header.batch_status}`);
  checked(await createDatabaseClient().rpc("creator_payout_observe", { p_id: w.id, p_batch: batch.batch_header.payout_batch_id, p_item: item?.payout_item_id ?? null, p_status: status }));
}
export function payoutsEnabled() {
  getPayPalConfig();
  return process.env.SCEENYK_PAYPAL_PAYOUTS_ENABLED === "sandbox-confirmed";
}
// Internal workflow only. No public action changes eligibility or provider state.
export async function processWithdrawal(id: string) {
  const db = createDatabaseClient();
  const w = await loadWithdrawal(id);
  if (["paid", "failed"].includes(w.status)) return "terminal";
  checked(await db.rpc("creator_payout_defer", { p_id: w.id }));
  if (w.status === "processing") {
    if (!w.paypal_batch_id) return "awaiting_verified_provider_reference";
    await observe(w, await readPayoutBatch(w.paypal_batch_id));
    return "reconciled";
  }
  // Database claim independently enforces the immutable seven-day boundary.
  const lots = z.array(z.object({ purchase_id: z.uuid(), remaining_minor: z.number().int().nonnegative() })).parse(checked(await db.from("creator_withdrawal_allocations").select("purchase_id,remaining_minor").eq("withdrawal_id", w.id)));
  for (const lot of lots.filter(lot => lot.remaining_minor > 0)) await reconcileMarketplaceFinancials(lot.purchase_id);
  const eligible = checked(await db.rpc("creator_payout_eligible", { p_id: w.id }));
  if (!eligible) return "pending";
  if (!payoutsEnabled()) return "sandbox_setup_required";
  const payoutToken = await assertPayoutWebhooksReady(); // Setup/OAuth before claim.
  const raw = await db.rpc("creator_payout_claim", { p_id: w.id });
  if (raw.error) throw new Error("CREATOR_WITHDRAWAL_UNAVAILABLE");
  if (!raw.data) return "not_claimed";
  const claimed = withdrawalRowSchema.parse(raw.data);
  try { await observe(claimed, await submitPayout(claimed, payoutToken), true); }
  catch (error) {
    if (error instanceof PayoutRejected) {
      checked(await db.rpc("creator_payout_observe", { p_id: claimed.id, p_batch: null, p_item: null, p_status: "DENIED", p_failure_code: error.code }));
      return "rejected";
    }
    // Includes a crash after accepted response but before DB persistence. Never
    // submit again. A verified webhook can recover the batch via sender ID.
    return "ambiguous";
  }
  return "submitted";
}
export async function handleVerifiedPayoutEvent(input: unknown) {
  const event = z.object({ event_type: z.string(), resource: z.object({ payout_batch_id: z.string().optional(), batch_header: z.object({ payout_batch_id: z.string() }).optional() }).passthrough() }).parse(input);
  if (!(payoutWebhookEvents as readonly string[]).includes(event.event_type)) return false;
  const batchId = event.resource.payout_batch_id ?? event.resource.batch_header?.payout_batch_id;
  if (!batchId) throw new Error("PAYPAL_PAYOUT_REFERENCE_MISSING");
  const batch = await readPayoutBatch(batchId);
  const id = z.uuid().safeParse(batch.batch_header.sender_batch_header.sender_batch_id);
  if (!id.success) return true;
  const result = await createDatabaseClient().from("creator_withdrawals").select("*").eq("id", id.data).maybeSingle();
  if (result.error) throw new Error("CREATOR_WITHDRAWAL_UNAVAILABLE");
  if (!result.data) return true; // Another merchant payout is not ours.
  const w = withdrawalRowSchema.parse(result.data);
  const item = verifyPayout(w, batch);
  if (w.status === "processing" || (w.status === "paid" && item && ["REFUNDED", "RETURNED"].includes(item.transaction_status))) await observe(w, batch);
  return true;
}
