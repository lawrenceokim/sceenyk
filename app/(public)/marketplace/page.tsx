import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Search, Store } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { creationCategories } from "@/components/creation/creation-options";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ListingCard, MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import { browseMarketplace } from "@/lib/marketplace/server";
import { categoryIds } from "@/lib/projects/options";
import type { CategoryId } from "@/lib/projects/options";

export const metadata: Metadata = { title: "Marketplace — Sceenyk", description: "Discover creator templates, adopt a creative starting point and make it your own." };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function Discovery({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const category = categoryIds.includes(params.category as CategoryId) ? params.category as CategoryId : null;
  const page = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Math.min(100000, Number(params.page))) : 1;
  const href = (nextPage: number) => `/marketplace?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(category ? { category } : {}), page: String(nextPage) })}`;
  let result;
  try { result = await browseMarketplace({ query, category, page }); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure />; }
  return <div className="space-y-7">
    <form action="/marketplace" method="get" role="search" className="sceenyk-card grid items-end gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,0.5fr)_auto] sm:p-5">
      <div><label htmlFor="marketplace-search" className="text-body-sm font-medium">Find a template</label><div className="relative mt-2"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden="true" /><input id="marketplace-search" name="q" type="search" maxLength={80} defaultValue={query} className="sceenyk-field pl-10" placeholder="Search titles, descriptions or tags" /></div></div>
      <div><label htmlFor="marketplace-category" className="text-body-sm font-medium">Category</label><select id="marketplace-category" name="category" defaultValue={category ?? ""} className="sceenyk-field mt-2"><option value="">All categories</option>{creationCategories.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></div>
      <Button type="submit">Search</Button>
    </form>
    {!!(query || category) && <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm"><p className="break-words text-muted-foreground">{result.total} results{query ? ` for “${query}”` : ""}</p><Link href="/marketplace" className="nav-link text-link">Clear filters</Link></div>}
    {result.items.length ? <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{result.items.map(listing => <ListingCard key={listing.id} listing={listing} />)}</div> : <div className="sceenyk-card"><EmptyState icon={<Store className="size-7" />} title={query || category ? "No matching templates" : page > 1 ? "No listings on this page" : "The next idea could be yours"} description={query || category ? "Try another search or choose a different category." : "Publish a reusable template from one of your saved projects to help other creators get started."} primaryAction={<Button variant="outline" nativeButton={false} render={<Link href={query || category || page > 1 ? "/marketplace" : "/dashboard/marketplace/new"} />}>{query || category || page > 1 ? "Browse all templates" : "Publish a template"}</Button>} /></div>}
    <MarketplacePagination {...result} href={href} />
  </div>;
}
export default function MarketplacePage({ searchParams }: { searchParams: SearchParams }) {
  return <div className="sceenyk-container space-y-8 py-8 md:py-12">
    <header className="flex flex-col justify-between gap-5 md:flex-row md:items-end"><div className="max-w-2xl space-y-3"><p className="eyebrow">MADE TO MAKE YOUR OWN</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl">A starting point for your next idea.</h1><p className="text-body text-muted-foreground">Discover reusable creator templates. Adopt one for free, add your own ideas and media, then create something new.</p></div><Button variant="outline" nativeButton={false} render={<Link href="/dashboard/marketplace" />}>My Marketplace Listings</Button></header>
    <p className="rounded-xl border border-border bg-accent/50 p-4 text-body-sm text-muted-foreground">Free adoption costs zero credits. Normal Sceenyk generation credits may still be required to create your result.</p>
    <Suspense fallback={<MarketplaceLoading />}><Discovery searchParams={searchParams} /></Suspense>
  </div>;
}
