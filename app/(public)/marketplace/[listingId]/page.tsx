import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { getMarketplaceListing } from "@/lib/marketplace/server";
import { usd } from "@/lib/marketplace/payments/contract";
import { AdoptButton } from "@/components/marketplace/adopt-button";
import { GenerationEstimate, MarketplaceFailure, MarketplaceLoading, TemplateCover, TemplateInformation } from "@/components/marketplace/listing-card";
import { creationCategories } from "@/components/creation/creation-options";

export const metadata: Metadata = { title: "Creator template — Sceenyk Marketplace" };
async function Detail({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  let listing;
  try { listing = await getMarketplaceListing(listingId); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href={`/marketplace/${encodeURIComponent(listingId)}`} />; }
  if (!listing) return <section className="sceenyk-card space-y-3 p-6"><h1 className="text-2xl font-bold">This template is unavailable</h1><p className="text-muted-foreground">It may no longer be published. Explore other creator templates.</p><Link href="/marketplace" className="nav-link text-link">Browse Marketplace</Link></section>;
  return <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-8">
    <div className="sceenyk-card min-w-0 overflow-hidden lg:col-start-1"><TemplateCover template={listing.template} large /></div>
    <div className="sceenyk-card min-w-0 space-y-5 p-5 sm:p-7 lg:col-start-2 lg:row-span-2 lg:row-start-1"><p className="eyebrow">{creationCategories.find(item => item.id === listing.category)!.title}</p><h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{listing.title}</h1>
      <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-accent-foreground" aria-hidden="true">{listing.creatorName.slice(0, 1).toUpperCase()}</span><p className="break-words text-body-sm">By {listing.creatorName}</p></div>
      <p className="whitespace-pre-wrap break-words text-body-sm leading-relaxed text-muted-foreground">{listing.description}</p>
      {!!listing.tags.length && <div className="flex flex-wrap gap-2">{listing.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-3 py-1 text-caption text-muted-foreground">{tag}</span>)}</div>}
      <div className="space-y-2 border-y border-border py-5"><p className="text-xl font-semibold">Creator adoption price: {listing.adoptionType === "free" ? "Free" : usd(listing.priceMinor)}</p><GenerationEstimate listing={listing} /><p className="text-body-sm leading-relaxed text-muted-foreground">Adoption includes no future AI generation usage. Normal Sceenyk credits may still be required. Your project will show an authoritative quote before you generate.</p></div>
      <AdoptButton listingId={listing.id} paid={listing.adoptionType === "paid"} estimate={listing.estimate} />
      <p className="text-caption text-muted-foreground">Adoption creates your own project. The creator keeps their original project, and their private media stays private.</p>
    </div>
    <div className="min-w-0 lg:col-start-1"><TemplateInformation template={listing.template} /></div>
  </div>;
}
export default function ListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  return <div className="sceenyk-container space-y-6 py-8 md:py-12"><Link className="nav-link inline-flex gap-2 text-link" href="/marketplace"><ArrowLeft className="size-4" aria-hidden="true" />Marketplace</Link><Suspense fallback={<MarketplaceLoading />}><Detail params={params} /></Suspense></div>;
}
