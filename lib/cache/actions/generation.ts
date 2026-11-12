"use client";
import * as actions from "@/app/actions/generation";
import { confirmedAction } from "../account-cache";
export * from "@/app/actions/generation";
export const createGenerationAction = (...args: Parameters<typeof actions.createGenerationAction>) => confirmedAction(["projects", "wallet", "allowance"], () => actions.createGenerationAction(...args));
