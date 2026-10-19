import Link from "next/link";
import { ArrowUpRight, LayoutTemplate, Pencil } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TemplateCover } from "@/components/marketplace/listing-card";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";
import { templateAppearance } from "@/components/marketplace/template-appearance";

// Configuration covers are the existing previews. Private project media is
// intentionally excluded from Marketplace snapshots and from this gallery.
export function TemplateLibrary({ result }: { result: ListingPage<OwnedListing> }) {
  return (
    <section id="templates" aria-label="Your template gallery" className="scroll-mt-24 space-y-8 lg:scroll-mt-8">
      {result.items.length ? (
        <ul className="template-saved-gallery">
          {result.items.map(listing => (
            <li key={listing.id} className="min-w-0">
              <article className="template-saved-card" style={templateAppearance(listing)}>
                <Link href={`/templates/${listing.id}`} aria-label={`Open template ${listing.title}`} className="template-saved-open">
                  <TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} />
                  <div className="template-saved-caption">
                    <h2>{listing.title}</h2>
                    <time dateTime={listing.publishedAt ?? listing.createdAt} title={listing.publishedAt ? "Published date" : "Created date"}>{new Date(listing.publishedAt ?? listing.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}</time>
                  </div>
                </Link>
                <div className="template-saved-actions">
                  <div>
                    {listing.status !== "archived" && <Link href={`/settings/templates/${listing.id}`} aria-label={`Manage template ${listing.title}`} title="Manage template"><Pencil aria-hidden="true" /></Link>}
                    {listing.status !== "published" && <span className="template-saved-status">{listing.status}</span>}
                  </div>
                  <Link href={`/templates/${listing.id}`} aria-label={`View template ${listing.title}`} title="View template"><ArrowUpRight aria-hidden="true" /></Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border">
          <EmptyState icon={<LayoutTemplate className="size-7" />} title={result.page > 1 ? "No templates on this page" : "Your next starting point"}
            description={result.page > 1 ? "Return to your latest templates." : "Templates from your Marketplace listings appear here. Choose an owned saved project to publish a reusable configuration; your original project and media stay private."}
            primaryAction={<Button nativeButton={false} render={<Link href={result.page > 1 ? "/templates" : "/settings/templates/new"} />}>{result.page > 1 ? "Latest templates" : "Choose a project"}</Button>}
            secondaryAction={<Button variant="outline" nativeButton={false} render={<Link href="/marketplace" />}>Explore Marketplace</Button>} />
        </div>
      )}
      {result.total > result.pageSize && <MarketplacePagination {...result} itemLabel="template" prefetch={false} href={page => `/templates?page=${page}`} />}
    </section>
  );
}
