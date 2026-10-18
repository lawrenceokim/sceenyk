import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { browseMarketplace, getMarketplaceListing } from "@/lib/marketplace/server";
import type { Listing } from "@/lib/marketplace/contract";
import { usd } from "@/lib/marketplace/payments/contract";
import { AdoptButton } from "@/components/marketplace/adopt-button";
import { GenerationEstimate, ListingCard, ListingCreator, MarketplaceFailure, MarketplaceLoading, TemplateCover, TemplateInformation } from "@/components/marketplace/listing-card";
import { creationCategories } from "@/components/creation/creation-options";
import { templateAppearance } from "@/components/marketplace/template-appearance";

export const metadata: Metadata = { title: "Creator template — Sceenyk Marketplace" };

function MarketplaceBack() {
  return <Link className="marketplace-back" href="/marketplace"><ArrowLeft className="size-3" aria-hidden="true" />Marketplace</Link>;
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
    return <section className="marketplace-more" aria-labelledby="more-looks"><h2 id="more-looks">More looks</h2><p className="text-body-sm text-muted-foreground">More templates are temporarily unavailable. <Link href="/marketplace" className="text-link underline underline-offset-4">Browse Marketplace</Link></p></section>;
  }
  return <section className="marketplace-more" aria-labelledby="more-looks">
    <h2 id="more-looks">More looks</h2>
    {items.length ? <div className="workspace-gallery marketplace-gallery marketplace-more-grid">{items.slice(0, 4).map(item => <ListingCard key={item.id} listing={item} />)}</div>
      : <p className="text-body-sm text-muted-foreground">More published templates will appear here as creators share them.</p>}
  </section>;
}

async function Detail({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  let listing;
  try { listing = await getMarketplaceListing(listingId); }
  catch (error) { unstable_rethrow(error); return <div className="marketplace-detail"><MarketplaceBack /><MarketplaceFailure href={`/marketplace/${encodeURIComponent(listingId)}`} /></div>; }
  if (!listing) return <div className="marketplace-detail"><MarketplaceBack /><section className="space-y-3"><h1 className="text-2xl font-bold">This template is unavailable</h1><p className="text-muted-foreground">It may no longer be published. Explore other creator templates.</p></section></div>;
  const category = creationCategories.find(item => item.id === listing.category)!;
  return <div className="marketplace-detail" style={templateAppearance(listing.template)}>
    <MarketplaceBack />
    <div className="marketplace-detail-main">
      <div className="marketplace-detail-preview"><TemplateCover template={listing.template} large /></div>
      <div className="marketplace-detail-info">
        <h1>{listing.title}</h1>
        <p className="marketplace-detail-description">{listing.description}</p>
        <div className="marketplace-tags"><span>{category.title}</span>{listing.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <ListingCreator listing={listing} />
        <div className="marketplace-detail-price"><p><span>Adoption price</span><strong>{listing.adoptionType === "free" ? "Free" : usd(listing.priceMinor)}</strong>{listing.adoptionType === "paid" && <span>USD · PayPal Sandbox</span>}</p><GenerationEstimate listing={listing} /></div>
        <div className="marketplace-detail-adopt"><AdoptButton listingId={listing.id} paid={listing.adoptionType === "paid"} estimate={listing.estimate} /></div>
        <p className="marketplace-detail-note">Adoption creates your own editable project; creator media stays private. AI generation is separate, with a quote shown before you generate.</p>
        <details className="marketplace-configuration"><summary>What you’ll adopt</summary><TemplateInformation template={listing.template} /></details>
      </div>
    </div>
    <Suspense fallback={<section className="marketplace-more" aria-busy="true"><h2>More looks</h2><p role="status" className="text-body-sm text-muted-foreground">Loading more templates…</p></section>}><MoreLooks listing={listing} /></Suspense>
  </div>;
}
export default function ListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  return <Suspense fallback={<div className="marketplace-detail"><MarketplaceBack /><MarketplaceLoading /></div>}><Detail params={params} /></Suspense>;
}
