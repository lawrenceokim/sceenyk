import { TemplateDetailSkeleton } from "@/components/marketplace/detail-skeletons";
import { GallerySkeleton } from "@/components/marketplace/gallery-skeletons";
import { moreLooksGridClassName } from "@/components/marketplace/gallery-skeletons";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { browseMarketplace, getMarketplaceListing } from "@/lib/marketplace/server";
import type { Listing } from "@/lib/marketplace/contract";
import { ListingCard, MarketplaceFailure } from "@/components/marketplace/listing-card";
import { TemplateDetail } from "@/components/marketplace/template-detail";

export const metadata: Metadata = { title: "Creator template — Sceenyk Marketplace" };

function MarketplaceBack() {
  return <Link className={`
      marketplace-back [&&:focus-visible]:[outline:2px_solid_var(--ring)] [&&:focus-visible]:[outline-offset:3px]
      [&&]:inline-flex [&&]:items-center [&&]:gap-[5px] [&&]:min-h-[24px] [&&]:mb-[24px] [&&]:pt-[3px] [&&]:pr-[8px]
      [&&]:pb-[3px] [&&]:pl-[8px] [&&]:rounded-[7px] [&&]:[background:color-mix(in_srgb,_var(--foreground)_5%,_transparent)]
      [&&]:text-[length:12px] [&&]:font-[600] [&&]:leading-[18px]
      [&&:hover]:[background:color-mix(in_srgb,_var(--foreground)_9%,_transparent)]
    `} href="/marketplace"><ArrowLeft className="size-3" aria-hidden="true" />Marketplace</Link>;
}

async function MoreLooks({ listing }: { listing: Listing }) {
  let items: Listing[];
  try {
    const related = await browseMarketplace({ category: listing.category, page: 1 });
    items = related.items.filter(item => item.id !== listing.id);
    // Reuse public browse only; no private data or new recommendation service.
    if (items.length < 4) {
      const recent = await browseMarketplace({ page: 1 });
      const seen = new Set([listing.id, ...items.map(item => item.id)]);
      items.push(...recent.items.filter(item => !seen.has(item.id)));
    }
    const relevance = (item: Listing) => (item.category === listing.category ? 10 : 0) + item.tags.filter(tag => listing.tags.includes(tag)).length;
    items.sort((a, b) => relevance(b) - relevance(a));
  } catch (error) {
    unstable_rethrow(error);
    return <section className={"marketplace-more [&&]:mt-[80px] [&&_>_h2]:mb-[26px] [&&_>_h2]:text-[length:20px] [&&_>_h2]:font-[700] [&&_>_h2]:leading-[26px] [&&_>_h2]:tracking-[-0.035em] max-599:[&&]:mt-[80px]"} aria-labelledby="more-looks"><h2 id="more-looks">More looks</h2><p className="text-body-sm text-muted-foreground">More templates are temporarily unavailable. <Link href="/marketplace" className="text-link underline underline-offset-4">Browse Marketplace</Link></p></section>;
  }
  return <section className={"marketplace-more [&&]:mt-[80px] [&&_>_h2]:mb-[26px] [&&_>_h2]:text-[length:20px] [&&_>_h2]:font-[700] [&&_>_h2]:leading-[26px] [&&_>_h2]:tracking-[-0.035em] max-599:[&&]:mt-[80px]"} aria-labelledby="more-looks">
    <h2 id="more-looks">More looks</h2>
    {items.length ? <div className={moreLooksGridClassName}>{items.slice(0, 4).map(item => <ListingCard key={item.id} listing={item} />)}</div>
      : <p className="text-body-sm text-muted-foreground">More published templates will appear here as creators share them.</p>}
  </section>;
}

async function Detail({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  let listing;
  try { listing = await getMarketplaceListing(listingId); }
  catch (error) { unstable_rethrow(error); return <div className={`
      marketplace-detail
      [.workspace-content_.workspace-page[data-workspace-page='content'][data-workspace-view='template-detail']_>_&&]:mt-[0]
      [&&]:relative [&&]:isolate [&&]:min-w-[0] [&&]:pt-[54px] [&&]:pr-[24px] [&&]:pb-[32px] [&&]:pl-[24px]
      [&&]:rounded-[var(--ui-radius-frame)] [&&]:[container-type:inline-size] [&&::before]:absolute [&&::before]:z-[-1]
      [&&::before]:top-[0] [&&::before]:right-[0] [&&::before]:left-[0] [&&::before]:h-[620px] [&&::before]:max-h-[100%]
      [&&::before]:rounded-[var(--ui-radius-frame)_var(--ui-radius-frame)_0_0]
      [&&::before]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color,_var(--muted))_48%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_22%,_var(--card))_40%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_5%,_var(--card))_72%,_var(--card)_100%_)]
      [&&::before]:[content:''] [&&::before]:pointer-events-none
      [.dark_&&::before]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color,_var(--muted))_65%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_30%,_var(--card))_40%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_7%,_var(--card))_72%,_var(--card)_100%_)]
      max-1023:[&&]:pt-[40px] max-599:[&&]:pt-[40px] max-599:[&&]:pr-[16px] max-599:[&&]:pb-[24px] max-599:[&&]:pl-[16px]
      max-599:[&&::before]:h-[570px]
    `}><MarketplaceBack /><MarketplaceFailure href={`/marketplace/${encodeURIComponent(listingId)}`} /></div>; }
  if (!listing) return <div className={`
      marketplace-detail
      [.workspace-content_.workspace-page[data-workspace-page='content'][data-workspace-view='template-detail']_>_&&]:mt-[0]
      [&&]:relative [&&]:isolate [&&]:min-w-[0] [&&]:pt-[54px] [&&]:pr-[24px] [&&]:pb-[32px] [&&]:pl-[24px]
      [&&]:rounded-[var(--ui-radius-frame)] [&&]:[container-type:inline-size] [&&::before]:absolute [&&::before]:z-[-1]
      [&&::before]:top-[0] [&&::before]:right-[0] [&&::before]:left-[0] [&&::before]:h-[620px] [&&::before]:max-h-[100%]
      [&&::before]:rounded-[var(--ui-radius-frame)_var(--ui-radius-frame)_0_0]
      [&&::before]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color,_var(--muted))_48%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_22%,_var(--card))_40%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_5%,_var(--card))_72%,_var(--card)_100%_)]
      [&&::before]:[content:''] [&&::before]:pointer-events-none
      [.dark_&&::before]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color,_var(--muted))_65%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_30%,_var(--card))_40%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_7%,_var(--card))_72%,_var(--card)_100%_)]
      max-1023:[&&]:pt-[40px] max-599:[&&]:pt-[40px] max-599:[&&]:pr-[16px] max-599:[&&]:pb-[24px] max-599:[&&]:pl-[16px]
      max-599:[&&::before]:h-[570px]
    `}><MarketplaceBack /><section className="space-y-3"><h1 className="text-2xl font-bold">This template is unavailable</h1><p className="text-muted-foreground">It may no longer be published. Explore other creator templates.</p></section></div>;
  return <TemplateDetail listing={listing}>
    <Suspense fallback={<section className={"marketplace-more [&&]:mt-[80px] [&&_>_h2]:mb-[26px] [&&_>_h2]:text-[length:20px] [&&_>_h2]:font-[700] [&&_>_h2]:leading-[26px] [&&_>_h2]:tracking-[-0.035em] max-599:[&&]:mt-[80px]"} aria-busy="true"><h2>More looks</h2><GallerySkeleton variant="related" count={4} /></section>}><MoreLooks listing={listing} /></Suspense>
  </TemplateDetail>;
}
export default function ListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  return <Suspense fallback={<TemplateDetailSkeleton />}><Detail params={params} /></Suspense>;
}
