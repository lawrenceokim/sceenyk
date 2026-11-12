import type { CreditWallet } from "@/lib/payments/types";
import type { CreditPurchasePricing } from "@/lib/payments/credit-pricing";
import type { FreeAllowance } from "@/lib/accounting/types";
import type { CreatorEarnings, MarketplacePurchaseSummary } from "@/lib/marketplace/payments/contract";
import type { WithdrawalAccount } from "@/lib/marketplace/withdrawals/contract";
import type { CreationPreferences } from "@/lib/settings/contract";
import type { CreatorProfile } from "@/lib/marketplace/creators/contract";
import type { Listing, ListingPage, OwnedListing } from "@/lib/marketplace/contract";

export type CacheDomain = "projects" | "templates" | "marketplace" | "purchases" | "wallet" | "allowance" | "earnings" | "history" | "preferences" | "profile" | "account" | "listings";
export type AccountData = {
  "credits-config": { clerkUserId: string; pricing: CreditPurchasePricing; configured: boolean };
  wallet: CreditWallet;
  "credit-summary": { available: number; lowBalance: boolean };
  allowance: FreeAllowance;
  earnings: { clerkUserId: string; earnings: CreatorEarnings; withdrawals: WithdrawalAccount };
  history: { clerkUserId: string; items: MarketplacePurchaseSummary[]; total: number; page: number; pageSize: number; previews: Record<string, Listing> };
  preferences: { clerkUserId: string; preferences: CreationPreferences };
  profile: { clerkUserId: string; profile: CreatorProfile | null };
  account: { clerkUserId: string };
  listings: ListingPage<OwnedListing> & { clerkUserId: string };
};
export type AccountResource = keyof AccountData;
export const resourceDomain: Record<AccountResource, CacheDomain> = {
  "credits-config": "account", wallet: "wallet", "credit-summary": "wallet", allowance: "allowance", earnings: "earnings",
  history: "history", preferences: "preferences", profile: "profile", account: "account", listings: "listings",
};
