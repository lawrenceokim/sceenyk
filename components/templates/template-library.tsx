import { templateLibraryGridClassName } from "@/components/marketplace/gallery-skeletons";
import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";
import { TemplateCard } from "./template-card";

export function TemplateLibrary({ result }: { result: ListingPage<OwnedListing> }) {
  return (
    <section id="templates" aria-label="Your template gallery" className="scroll-mt-24 space-y-8 lg:scroll-mt-8">
      {result.items.length ? (
        <ul className={templateLibraryGridClassName}>
          {result.items.map(listing => (
            <li key={listing.id} className="min-w-0">
              <TemplateCard listing={listing} />
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
