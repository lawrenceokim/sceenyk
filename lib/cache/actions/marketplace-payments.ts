"use client";
import * as actions from "@/app/actions/marketplace-payments";
import { accountSessionCache, confirmedAction } from "../account-cache";
export * from "@/app/actions/marketplace-payments";
export const marketplaceCheckoutAction = (...args: Parameters<typeof actions.marketplaceCheckoutAction>) => confirmedAction(["history"], () => actions.marketplaceCheckoutAction(...args));
export const createMarketplaceOrderAction = (...args: Parameters<typeof actions.createMarketplaceOrderAction>) => confirmedAction(["history"], () => actions.createMarketplaceOrderAction(...args));
export async function recoverMarketplacePurchaseAction(...args: Parameters<typeof actions.recoverMarketplacePurchaseAction>) {
  const ticket = accountSessionCache.ticket(), result = await actions.recoverMarketplacePurchaseAction(...args);
  if (result.ok && accountSessionCache.receipt(`purchase-recovery:${result.data.id}`, result.data, ticket)) {
    await accountSessionCache.confirmed(result.data.status === "completed" ? ["history", "purchases", "projects"] : ["history"], ticket).catch(() => {});
  }
  return result;
}
