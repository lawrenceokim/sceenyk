import "server-only";
import { readAppUser } from "@/lib/auth/read-app-user";
import { z } from "zod";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { payoutEmail, withdrawalInput } from "./contract";
import { creatorWithdrawalAccount } from "./creator-account";

function checked<T>(r: { data: T | null; error: unknown }): T {
  if (r.error || r.data === null) throw new Error("CREATOR_WITHDRAWAL_UNAVAILABLE");
  return r.data;
}
export async function getWithdrawalAccount(page = 1) {
  const user = await readAppUser();
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
// Preserve existing imports; the processor has no request-bound auth imports.
export { processWithdrawal, handleVerifiedPayoutEvent, payoutsEnabled } from "./processor";
