"use server";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { completeCreditOrder, createCreditOrder, getCreditWallet, reconcileOwnedCreditOrders } from "@/lib/payments/server";
import type { PaymentResult } from "@/lib/payments/types";
import { getCreditSummary, getPaidCreditBalance } from "@/lib/accounting/server";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { sandboxCreditPacks } from "@/lib/payments/packs";
import { isPayPalConfigured } from "@/lib/payments/paypal/config";

async function paymentAction<T>(run: () => Promise<T>): Promise<PaymentResult<T>> {
  try { return { ok: true, data: await run() }; }
  catch (error) {
    unstable_rethrow(error);
    // Provider/DB error bodies can contain private data. Only safe copy leaves.
    return { ok: false, message: "Payment couldn’t be confirmed. Check your saved purchases before starting another checkout." };
  }
}

export async function createCreditOrderAction(input: unknown) {
  return paymentAction(() => createCreditOrder(input));
}
export async function completeCreditOrderAction(input: unknown) {
  return paymentAction(async () => {
    const result = await completeCreditOrder(input);
    revalidatePath("/studio");
    revalidatePath("/credits");
    revalidatePath("/settings/credits");
    return result;
  });
}
export async function cancelCreditOrderAction(input: unknown) {
  return paymentAction(() => completeCreditOrder(input, true));
}
export async function creditWalletAction() {
  return paymentAction(getCreditWallet);
}
export async function creditBalanceAction() {
  return paymentAction(getPaidCreditBalance);
}
export async function creditSummaryAction() {
  return paymentAction(getCreditSummary);
}
export async function creditCheckoutAction() {
  return paymentAction(async () => {
    const user = await ensureAppUser();
    return { clerkUserId: user.clerk_user_id, packs: [...sandboxCreditPacks], configured: isPayPalConfigured() };
  });
}
export async function reconcileCreditOrdersAction() {
  return paymentAction(async () => {
    const result = await reconcileOwnedCreditOrders();
    revalidatePath("/studio");
    revalidatePath("/credits");
    revalidatePath("/settings/credits");
    return result;
  });
}
