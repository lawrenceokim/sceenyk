import { Suspense } from "react";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { getCreatorStorefront } from "@/lib/marketplace/creators/server";
import { CreatorStorefront } from "@/components/marketplace/creator-storefront";
import { MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";

export const metadata = { title: "Creator storefront — Sceenyk Marketplace" };
type Props = { params: Promise<{ creatorSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
async function Storefront({ params, searchParams }: Props) {
  const { creatorSlug } = await params, { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let data;
  try { data = await getCreatorStorefront(creatorSlug, current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href={`/marketplace/creators/${encodeURIComponent(creatorSlug)}`} />; }
  if (!data) notFound();
  return <CreatorStorefront data={data} />;
}
export default function Page(props: Props) {
  return <div className="space-y-6"><Link href="/marketplace" className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link inline-flex min-h-11
      items-center text-link [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}>Back to Marketplace</Link><Suspense fallback={<MarketplaceLoading />}><Storefront {...props} /></Suspense></div>;
}
