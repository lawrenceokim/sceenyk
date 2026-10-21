import { SettingsSection } from "@/components/settings/settings-section";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { getOwnedMarketplaceListing } from "@/lib/marketplace/server";
import { ListingEditor } from "@/components/marketplace/listing-editor";
import { MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";

export const metadata: Metadata = { title: "Manage Template — Sceenyk", robots: { index: false, follow: false } };
async function OwnedListing({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const user = await ensureAppUser();
  let listing;
  try { listing = await getOwnedMarketplaceListing(listingId); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/settings/templates" />; }
  if (!listing) return <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-3 p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="text-lg font-semibold">This listing is unavailable</h2><Link className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link text-link
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `} href="/settings/templates">My Marketplace Listings</Link></section>;
  return <ListingEditor clerkUserId={user.clerk_user_id} listing={listing} />;
}
export default function ManageListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  return <SettingsSection title="Manage Template" description="Review your template and control when it appears in Marketplace."><Suspense fallback={<MarketplaceLoading />}><OwnedListing params={params} /></Suspense></SettingsSection>;
}
