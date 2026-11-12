"use client";
import * as actions from "@/app/actions/marketplace";
import { accountSessionCache, confirmedAction } from "../account-cache";
import { templatesSessionCache } from "@/lib/templates/session-cache";
import { marketplaceSessionCache } from "@/lib/marketplace/session-cache";
export * from "@/app/actions/marketplace";
export const createMarketplaceAction = (...args: Parameters<typeof actions.createMarketplaceAction>) => confirmedAction(["projects","templates","marketplace","purchases","listings"], () => actions.createMarketplaceAction(...args));
export const updateMarketplaceAction = (...args: Parameters<typeof actions.updateMarketplaceAction>) => confirmedAction(["projects","templates","marketplace","purchases","listings"], () => actions.updateMarketplaceAction(...args));
export const initializeTemplateAction = (...args: Parameters<typeof actions.initializeTemplateAction>) => confirmedAction(["projects","templates","listings"], () => actions.initializeTemplateAction(...args));
export const adoptMarketplaceAction = (...args: Parameters<typeof actions.adoptMarketplaceAction>) => confirmedAction(["projects","purchases"], () => actions.adoptMarketplaceAction(...args));
export const deleteTemplateAction = (...args: Parameters<typeof actions.deleteTemplateAction>) => confirmedAction(["projects","templates","marketplace","purchases","listings"], () => actions.deleteTemplateAction(...args), (result, scope) => {
  if (result.ok && "listingId" in result) {
    templatesSessionCache.removeTemplate(scope, result.listingId); marketplaceSessionCache.removeListing(scope, result.listingId);
    accountSessionCache.removeRow(scope, "listings", result.listingId);
  }
});
