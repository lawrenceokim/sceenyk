"use client";
import * as actions from "@/app/actions/creator-profile";
import { confirmedAction } from "../account-cache";
export * from "@/app/actions/creator-profile";
export const saveCreatorProfileAction = (...args: Parameters<typeof actions.saveCreatorProfileAction>) => confirmedAction(["profile","marketplace","templates","purchases","listings"], () => actions.saveCreatorProfileAction(...args));
export const removeCreatorAvatarAction = (...args: Parameters<typeof actions.removeCreatorAvatarAction>) => confirmedAction(["profile","marketplace","templates","purchases","listings"], () => actions.removeCreatorAvatarAction(...args));
