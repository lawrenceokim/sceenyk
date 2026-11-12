"use client";
import * as actions from "@/app/actions/studio-mode";
import { confirmedAction } from "../account-cache";
export * from "@/app/actions/studio-mode";
export const saveStudioModeAction = (...args: Parameters<typeof actions.saveStudioModeAction>) => confirmedAction(["projects"], () => actions.saveStudioModeAction(...args));
