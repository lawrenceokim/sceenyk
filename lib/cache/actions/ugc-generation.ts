"use client";
import * as actions from "@/app/actions/ugc-generation";
import { confirmedAction } from "../account-cache";
export * from "@/app/actions/ugc-generation";
export const enqueueUgcGenerationAction = (...args: Parameters<typeof actions.enqueueUgcGenerationAction>) => confirmedAction(["projects","wallet","allowance"], () => actions.enqueueUgcGenerationAction(...args));
