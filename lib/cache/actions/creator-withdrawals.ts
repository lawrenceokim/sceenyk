"use client";
import * as actions from "@/app/actions/creator-withdrawals";
import { confirmedAction } from "../account-cache";
export * from "@/app/actions/creator-withdrawals";
export const payoutDestinationAction = (...args: Parameters<typeof actions.payoutDestinationAction>) => confirmedAction(["earnings"], () => actions.payoutDestinationAction(...args));
export const withdrawalRequestAction = (...args: Parameters<typeof actions.withdrawalRequestAction>) => confirmedAction(["earnings"], () => actions.withdrawalRequestAction(...args));
