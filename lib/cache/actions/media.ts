"use client";
import * as actions from "@/app/actions/media";
import { confirmedAction } from "../account-cache";
export * from "@/app/actions/media";
export const finalizeMediaAction = (...args: Parameters<typeof actions.finalizeMediaAction>) => confirmedAction(["projects","templates","marketplace","purchases"], () => actions.finalizeMediaAction(...args));
export const removeStudioReferenceAction = (...args: Parameters<typeof actions.removeStudioReferenceAction>) => confirmedAction(["projects","templates","marketplace","purchases"], () => actions.removeStudioReferenceAction(...args));
