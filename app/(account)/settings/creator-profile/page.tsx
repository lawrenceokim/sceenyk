import { SettingsSection } from "@/components/settings/settings-section";
import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getOwnedCreatorProfile } from "@/lib/marketplace/creators/server";
import { CreatorProfileEditor } from "@/components/marketplace/creator-profile-editor";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";

export const metadata = { title: "Public creator profile — Sceenyk", robots: { index: false, follow: false } };
async function Content() {
  let result;
  try { result = await getOwnedCreatorProfile(); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/settings/creator-profile" />; }
  return <CreatorProfileEditor {...result} />;
}
export default function Page() {
  return <SettingsSection title="Creator Profile" description="Choose how you appear on the public Marketplace."><header className="space-y-3"><p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>YOUR CREATOR SPACE</p></header><Link href="/settings/templates" className={`
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
    `}>My Marketplace Listings</Link><Suspense fallback={<p role="status">Loading your profile…</p>}><Content /></Suspense></SettingsSection>;
}
