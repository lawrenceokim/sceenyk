import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TemplateCover } from "@/components/marketplace/listing-card";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";

// Configuration covers are the existing previews. Private project media is
// intentionally excluded from Marketplace snapshots and from this gallery.
export function TemplateLibrary({ result }: { result: ListingPage<OwnedListing> }) {
  return (
    <section id="templates" aria-label="Your template gallery" className="scroll-mt-24 space-y-8 lg:scroll-mt-8">
      {result.items.length ? (
        <ul className="workspace-gallery">
          {result.items.map(listing => (
            <li key={listing.id} className="min-w-0">
              <article className="workspace-gallery-card h-full">
                <Link href={`/dashboard/marketplace/${listing.id}`} aria-label={`Open template ${listing.title}`} className="relative block focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring">
                  <TemplateCover template={listing.template} />
                  <span className="workspace-gallery-badge capitalize">{listing.status}</span>
                </Link>
                <div className="workspace-gallery-copy">
                  <h2 className="line-clamp-1 break-words">{listing.title}</h2>
                  <p className="line-clamp-2 break-words text-muted-foreground">{listing.description}</p>
                  <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
                    <Link href={`/dashboard/marketplace/${listing.id}`} className="nav-link text-link">{listing.status === "archived" ? "View template" : "Manage template"}</Link>
                    {listing.status === "published" && <Link href={`/marketplace/${listing.id}`} className="nav-link text-muted-foreground">Public listing</Link>}
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border">
          <EmptyState icon={<LayoutTemplate className="size-7" />} title={result.page > 1 ? "No templates on this page" : "Your next starting point"}
            description={result.page > 1 ? "Return to your latest templates." : "Templates from your Marketplace listings appear here. Choose an owned saved project to publish a reusable configuration; your original project and media stay private."}
            primaryAction={<Button nativeButton={false} render={<Link href={result.page > 1 ? "/dashboard/templates" : "/dashboard/marketplace/new"} />}>{result.page > 1 ? "Latest templates" : "Choose a project"}</Button>}
            secondaryAction={<Button variant="outline" nativeButton={false} render={<Link href="/marketplace" />}>Explore Marketplace</Button>} />
        </div>
      )}
      {result.total > result.pageSize && <MarketplacePagination {...result} itemLabel="template" prefetch={false} href={page => `/dashboard/templates?page=${page}`} />}
    </section>
  );
}
