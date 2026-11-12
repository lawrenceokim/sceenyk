"use client";
import * as actions from "@/app/actions/settings";
import { accountSessionCache, confirmedAction } from "../account-cache";
export * from "@/app/actions/settings";
export const saveCreationPreferencesAction = (...args: Parameters<typeof actions.saveCreationPreferencesAction>) => confirmedAction(["preferences"], () => actions.saveCreationPreferencesAction(...args), (result, scope) => {
  if (result.ok && result.data.clerkUserId === scope.split("/")[0]) accountSessionCache.patch(scope, "preferences:1", result.data);
});
