import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { creationCategories } from "@/components/creation/creation-options";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  ListingCard,
  MarketplaceFailure,
  MarketplaceLoading,
} from "@/components/marketplace/listing-card";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import { browseMarketplace } from "@/lib/marketplace/server";
import { categoryIds } from "@/lib/projects/options";
import type { CategoryId } from "@/lib/projects/options";

export const metadata: Metadata = {
  title: "Marketplace — Sceenyk",
  description:
    "Discover creator templates, adopt a creative starting point and make it your own.",
};
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function Discovery({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const category = categoryIds.includes(params.category as CategoryId)
    ? (params.category as CategoryId)
    : null;
  const page =
    typeof params.page === "string" && /^\d{1,6}$/.test(params.page)
      ? Math.max(1, Math.min(100000, Number(params.page)))
      : 1;
  const href = (nextPage: number) =>
    `/marketplace?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(category ? { category } : {}), page: String(nextPage) })}`;
  let result;
  try {
    result = await browseMarketplace({ query, category, page });
  } catch (error) {
    unstable_rethrow(error);
    return <MarketplaceFailure />;
  }
  const filterHref = (value: CategoryId | null) => {
    const filters = new URLSearchParams({
      ...(query ? { q: query } : {}),
      ...(value ? { category: value } : {}),
    });
    return `/marketplace${filters.size ? `?${filters}` : ""}`;
  };
  return (
    <div className="marketplace-discovery">
      <nav aria-label="Marketplace categories" className="marketplace-filters">
        <Link
          href={filterHref(null)}
          aria-current={!category ? "page" : undefined}
        >
          All
        </Link>
        {creationCategories.map((item) => (
          <Link
            key={item.id}
            href={filterHref(item.id)}
            aria-current={category === item.id ? "page" : undefined}
          >
            {item.title}
          </Link>
        ))}
      </nav>
      {!!query && (
        <div className="marketplace-query">
          <p>
            {result.total} results for “{query}”
          </p>
          <Link
            href={
              category ? `/marketplace?category=${category}` : "/marketplace"
            }
            className="nav-link text-link"
          >
            Clear search
          </Link>
        </div>
      )}
      {result.items.length ? (
        <div className="workspace-gallery marketplace-gallery">
          {result.items.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <div className="sceenyk-card">
          <EmptyState
            icon={<Store className="size-7" />}
            title={
              query || category
                ? "No matching templates"
                : page > 1
                  ? "No listings on this page"
                  : "The next idea could be yours"
            }
            description={
              query || category
                ? "Choose another category or browse all templates."
                : "Publish a reusable template from one of your saved projects to help other creators get started."
            }
            primaryAction={
              <Button
                variant="outline"
                nativeButton={false}
                render={
                  <Link
                    href={
                      query || category || page > 1
                        ? "/marketplace"
                        : "/dashboard/marketplace/new"
                    }
                  />
                }
              >
                {query || category || page > 1
                  ? "Browse all templates"
                  : "Publish a template"}
              </Button>
            }
          />
        </div>
      )}
      <MarketplacePagination {...result} href={href} />
    </div>
  );
}
export default function MarketplacePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="workspace-marketplace marketplace-index p-5">
      <header className="marketplace-heading">
        <h1>Marketplace</h1>
        <p>Discover creative projects. Make them your own.</p>
      </header>
      <Suspense fallback={<MarketplaceLoading />}>
        <Discovery searchParams={searchParams} />
      </Suspense>
      <Link
        href="/dashboard/marketplace"
        className="marketplace-management-link nav-link text-muted-foreground hidden"
      >
        Manage my listings
      </Link>
    </div>
  );
}
