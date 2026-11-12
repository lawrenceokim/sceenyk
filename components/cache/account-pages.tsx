"use client";

import { useSearchParams } from "next/navigation";
import { useAccountQuery, useAccountScroll } from "./use-account-query";
import { CreditPurchases } from "@/components/payments/credit-purchases";
import { CreditAccountSkeleton, EarningsSkeleton, PurchasesSkeleton } from "@/components/payments/financial-skeletons";
import { FinancialPanel } from "@/components/marketplace/financial-panels";
import { TemplateCover } from "@/components/marketplace/listing-card";
import { CreationPreferencesForm } from "@/components/settings/creation-preferences";
import { CreatorProfileEditor } from "@/components/marketplace/creator-profile-editor";
import { AccountSettings } from "@/components/settings/account-settings";
import { AccountSettingsSkeleton, CreationPreferencesSkeleton, CreatorProfileSkeleton } from "@/components/settings/settings-skeletons";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { GallerySkeleton } from "@/components/marketplace/gallery-skeletons";
import { AppNotification } from "@/components/notifications/app-notification";
import { Button } from "@/components/ui/button";

function RefreshFailure({ retry }: { retry: () => Promise<unknown> }) {
  return <div className="space-y-3"><AppNotification role="alert">This account information couldn’t be loaded.</AppNotification><Button variant="outline" onClick={() => { void retry().catch(() => {}); }}>Try again</Button></div>;
}
function SavedNotice() { return <AppNotification role="status">This information couldn’t be refreshed. Showing your last confirmed data.</AppNotification>; }
function usePage() {
  const params = useSearchParams(), value = params.get("page");
  return value && /^\d{1,6}$/.test(value) ? Math.max(1, Math.min(100000, Number(value))) : 1;
}
export function CreditsPageClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  const query = useAccountQuery("credits-config", 1, { cachedOnly, staleMs: 300000 });
  useAccountScroll("credits-config:1", !!query.data, cachedOnly);
  if (!query.data) return query.error ? <RefreshFailure retry={query.retry} /> : <CreditAccountSkeleton dashboard />;
  return <>{query.error && <SavedNotice />}<CreditPurchases dashboard {...query.data} cachedOnly={cachedOnly} /></>;
}
export function EarningsPageClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  const page = usePage(), query = useAccountQuery("earnings", page, { cachedOnly });
  useAccountScroll(query.key, !!query.data, cachedOnly);
  if (!query.data) return query.error ? <RefreshFailure retry={query.retry} /> : <EarningsSkeleton />;
  return <>{query.error && <SavedNotice />}<FinancialPanel cacheMode cachedOnly={cachedOnly} clerkUserId={query.data.clerkUserId} page={page} earnings={query.data.earnings} withdrawals={query.data.withdrawals} /></>;
}
export function HistoryPageClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  const page = usePage(), query = useAccountQuery("history", page, { cachedOnly });
  useAccountScroll(query.key, !!query.data, cachedOnly);
  if (!query.data) return query.error ? <RefreshFailure retry={query.retry} /> : <PurchasesSkeleton />;
  const previews = Object.fromEntries(Object.entries(query.data.previews).map(([id, listing]) => [id, <TemplateCover key={id} template={listing.template} fallbackColor={listing.fallbackColor} previewId={id} previewUrl={listing.previewUrl} />]));
  return <>{query.error && <SavedNotice />}<FinancialPanel cacheMode cachedOnly={cachedOnly} clerkUserId={query.data.clerkUserId} page={page} purchases={query.data} purchasePreviews={previews} /></>;
}
export function CreationSettingsClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  const query = useAccountQuery("preferences", 1, { cachedOnly });
  useAccountScroll(query.key, !!query.data, cachedOnly);
  if (!query.data) return query.error ? <RefreshFailure retry={query.retry} /> : <CreationPreferencesSkeleton />;
  return <>{query.error && <SavedNotice />}<CreationPreferencesForm {...query.data} /></>;
}
export function ProfileSettingsClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  const query = useAccountQuery("profile", 1, { cachedOnly });
  useAccountScroll(query.key, !!query.data, cachedOnly);
  if (!query.data) return query.error ? <RefreshFailure retry={query.retry} /> : <CreatorProfileSkeleton />;
  return <>{query.error && <SavedNotice />}<CreatorProfileEditor {...query.data} /></>;
}
export function AccountSettingsClient({ security = false, cachedOnly = false }: { security?: boolean; cachedOnly?: boolean }) {
  const query = useAccountQuery("account", 1, { cachedOnly, staleMs: 300000 });
  useAccountScroll(query.key, !!query.data, cachedOnly);
  if (!query.data) return query.error ? <RefreshFailure retry={query.retry} /> : <AccountSettingsSkeleton security={security} />;
  return <>{query.error && <SavedNotice />}<AccountSettings {...query.data} security={security} /></>;
}
export function ManagedTemplatesClient({ cachedOnly = false }: { cachedOnly?: boolean }) {
  const page = usePage(), query = useAccountQuery("listings", page, { cachedOnly });
  useAccountScroll(query.key, !!query.data, cachedOnly);
  if (!query.data) return query.error ? <RefreshFailure retry={query.retry} /> : <GallerySkeleton variant="management" />;
  return <>{query.error && <SavedNotice />}<OwnedListings clerkUserId={query.data.clerkUserId} result={query.data} cachedOnly={cachedOnly} /></>;
}
