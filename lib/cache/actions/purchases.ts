"use client";
import * as actions from "@/app/actions/purchases";
import { confirmedAction } from "../account-cache";
export * from "@/app/actions/purchases";
export const openPurchaseProjectAction = (...args: Parameters<typeof actions.openPurchaseProjectAction>) => confirmedAction(["projects"], () => actions.openPurchaseProjectAction(...args));
