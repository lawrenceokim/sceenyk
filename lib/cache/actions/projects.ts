"use client";
import * as actions from "@/app/actions/projects";
import { confirmedAction } from "../account-cache";
import { projectsSessionCache } from "@/lib/projects/session-cache";
export * from "@/app/actions/projects";
export const saveProjectAction = (...args: Parameters<typeof actions.saveProjectAction>) => confirmedAction(["projects","templates","marketplace","purchases"], () => actions.saveProjectAction(...args), (result, scope) => { if (result.ok) projectsSessionCache.saveSummary(scope, result.project); });
export const renameProjectAction = (...args: Parameters<typeof actions.renameProjectAction>) => confirmedAction(["projects"], () => actions.renameProjectAction(...args), (result, scope) => { if (result.ok) projectsSessionCache.rename(scope, result.project); });
export const deleteProjectAction = (...args: Parameters<typeof actions.deleteProjectAction>) => confirmedAction(["projects","templates","marketplace","purchases"], () => actions.deleteProjectAction(...args), (result, scope) => { if (result.ok) projectsSessionCache.remove(scope, result.projectId); });
