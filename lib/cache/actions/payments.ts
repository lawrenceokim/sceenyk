"use client";
import * as actions from "@/app/actions/payments";
import { accountSessionCache, confirmedAction } from "../account-cache";
export * from "@/app/actions/payments";
export const createCreditOrderAction = (...args: Parameters<typeof actions.createCreditOrderAction>) => confirmedAction(["wallet"], () => actions.createCreditOrderAction(...args));
export const completeCreditOrderAction = (...args: Parameters<typeof actions.completeCreditOrderAction>) => confirmedAction(["wallet"], () => actions.completeCreditOrderAction(...args));
export const cancelCreditOrderAction = (...args: Parameters<typeof actions.cancelCreditOrderAction>) => confirmedAction(["wallet"], () => actions.cancelCreditOrderAction(...args));
export async function reconcileCreditOrdersAction() {
  const ticket = accountSessionCache.ticket();
  const result = await actions.reconcileCreditOrdersAction();
  if (result.ok && result.data.recovered > 0) await accountSessionCache.confirmed(["wallet"], ticket).catch(() => {});
  return result;
}
