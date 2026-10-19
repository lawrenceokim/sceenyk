"use server";
import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createMarketplaceOrder, getCreatorEarnings, getMarketplacePurchases, prepareMarketplaceCheckout, recoverMarketplacePurchase } from "@/lib/marketplace/payments/server";
import type { PaymentResult } from "@/lib/payments/types";

async function run<T>(work: () => Promise<T>): Promise<PaymentResult<T>> {
  try { return { ok: true, data: await work() }; }
  catch (error) { unstable_rethrow(error); return { ok: false, message: "Marketplace payment couldn’t be confirmed. Check your saved Marketplace purchases to recover without paying again." }; }
}
export async function marketplaceCheckoutAction(input: unknown) { return run(() => prepareMarketplaceCheckout(input)); }
export async function createMarketplaceOrderAction(input: unknown) { return run(() => createMarketplaceOrder(input)); }
export async function recoverMarketplacePurchaseAction(input: unknown) {
  return run(async () => {
    const result = await recoverMarketplacePurchase(input);
    revalidatePath("/projects"); revalidatePath("/settings/templates", "layout");
    return result;
  });
}
export async function marketplacePurchasesAction(page = 1) { return run(() => getMarketplacePurchases(page)); }
export async function creatorEarningsAction(page = 1) { return run(() => getCreatorEarnings(page)); }
