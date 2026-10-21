import { MarketplaceDiscoverySkeleton } from "@/components/marketplace/gallery-skeletons";
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Store } from "lucide-react";
import { unstable_rethrow } from "next/navigation";
import { creationCategories } from "@/components/creation/creation-options";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  MarketplaceFailure,
  MarketplaceLoading,
} from "@/components/marketplace/listing-card";
import { MarketplaceInfiniteGallery } from "@/components/marketplace/infinite-gallery";
import { browseMarketplace } from "@/lib/marketplace/server";
import { categoryIds } from "@/lib/projects/options";
import type { CategoryId } from "@/lib/projects/options";

export const metadata: Metadata = {
  title: "Marketplace — Sceenyk",
  description:
    "Discover creator templates, adopt a creative starting point and make it your own.",
};
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
async function DiscoveryResults({ query, category, page }: { query: string; category: CategoryId | null; page: number }) {
  let result;
  try {
    result = await browseMarketplace({ query, category, page });
  } catch (error) {
    unstable_rethrow(error);
    return <MarketplaceFailure />;
  }
  return <>
      {!!query && (
        <div className={`
      marketplace-query [&&]:flex [&&]:flex-wrap [&&]:justify-between [&&]:gap-[8px] [&&]:mt-[-16px] [&&]:mr-[0]
      [&&]:mb-[24px] [&&]:ml-[0] [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:12px]
      [&&]:[overflow-wrap:anywhere]
    `}>
          <p>
            {result.total} results for “{query}”
          </p>
          <Link
            href={
              category ? `/marketplace?category=${category}` : "/marketplace"
            }
            className={`
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
    `}
          >
            Clear search
          </Link>
        </div>
      )}
      {result.items.length ? (
        <MarketplaceInfiniteGallery key={`${query}:${category ?? "all"}:${page}`} initial={result} query={query} category={category} />
      ) : (
        <div className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card [.marketplace-configuration_>_&&]:[border:0]
      [.marketplace-configuration_>_&&]:rounded-[0] [.marketplace-configuration_>_&&]:[background:transparent]
      [.marketplace-configuration_>_&&]:pt-[16px] [.marketplace-configuration_>_&&]:pr-[0]
      [.marketplace-configuration_>_&&]:pb-[0] [.marketplace-configuration_>_&&]:pl-[0]
      [[data-workspace-shell]_&&]:[box-shadow:none] [.workspace-settings-inner_label&&]:min-h-[0]
      [.workspace-settings-inner_label&&]:gap-[8px] [.workspace-settings-inner_label&&]:pt-[12px]
      [.workspace-settings-inner_label&&]:pr-[12px] [.workspace-settings-inner_label&&]:pb-[12px]
      [.workspace-settings-inner_label&&]:pl-[12px] [.workspace-settings-inner_label&&_svg]:w-[18px]
      [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}>
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
                        : "/settings/templates/new"
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
  </>;
}

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
  const filterHref = (value: CategoryId | null) => {
    const filters = new URLSearchParams({
      ...(query ? { q: query } : {}),
      ...(value ? { category: value } : {}),
    });
    return `/marketplace${filters.size ? `?${filters}` : ""}`;
  };
  return (
    <div className={"marketplace-discovery [&&]:min-w-[0]"}>
      <nav aria-label="Marketplace categories" className={`
      marketplace-filters [&&]:flex [&&]:flex-wrap [&&]:gap-[8px] [&&]:mb-[40px] [&&_a]:inline-flex [&&_a]:min-h-[26px]
      [&&_a]:items-center [&&_a]:justify-center [&&_a]:pt-[3px] [&&_a]:pr-[12px] [&&_a]:pb-[3px] [&&_a]:pl-[12px]
      [&&_a]:[border:1px_solid_var(--border)] [&&_a]:rounded-[999px] [&&_a]:text-[color:var(--muted-foreground)]
      [&&_a]:text-[length:12px] [&&_a]:font-[500] [&&_a]:leading-[18px]
      [&&_a]:[transition:background-color_150ms,_color_150ms,_border-color_150ms] [&&_a:hover]:text-[color:var(--foreground)]
      [&&_a:hover]:[background:var(--muted)] [&&_a[aria-current='page']]:[border-color:transparent]
      [&&_a[aria-current='page']]:[background:var(--foreground)] [&&_a[aria-current='page']]:text-[color:var(--card)]
      [&&_a:focus-visible]:[outline:2px_solid_var(--ring)] [&&_a:focus-visible]:[outline-offset:3px]
      [@media_(prefers-reduced-motion:_reduce)]:[&&_a]:[transition:none]
    `}>
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
      <Suspense key={`${query}:${category ?? "all"}:${page}`} fallback={<MarketplaceLoading />}><DiscoveryResults query={query} category={category} page={page} /></Suspense>
    </div>
  );
}
export default function MarketplacePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className={"workspace-marketplace marketplace-index p-5 [&&]:flex [&&]:flex-col [&&]:gap-[24px] [&&_header]:max-w-[100%] [&&_header_h1]:max-w-[660px] [.workspace-marketplace&&]:gap-[24px]"}>
      <header className={`
      marketplace-heading [&&_h1]:mt-[0] [&&_h1]:mr-[0] [&&_h1]:mb-[0] [&&_h1]:ml-[0] [&&_h1]:font-[700]
      [&&_>_p]:max-w-[610px] [&&_>_p]:mt-[12px] [&&_>_p]:text-[color:var(--muted-foreground)] [&&_>_p]:text-[length:20px]
      [&&_>_p]:leading-[1.4] [&&_>_p]:tracking-[-0.025em] max-599:[&&_>_p]:text-[length:18px] max-599:[&&_>_p]:leading-[27px]
      max-599:[.workspace-templates_&&_>_p]:text-[length:16px] max-599:[.workspace-templates_&&_>_p]:leading-[24px]
    `}>
        <h1>Marketplace</h1>
        <p>Discover creative projects. Make them your own.</p>
      </header>
      <Suspense fallback={<MarketplaceDiscoverySkeleton />}>
        <Discovery searchParams={searchParams} />
      </Suspense>
      <Link
        href="/settings/templates"
        className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] marketplace-management-link nav-link
      text-muted-foreground hidden [&&]:[align-self:flex-start] [&&]:text-[length:12px]
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
    `}
      >
        Manage my listings
      </Link>
    </div>
  );
}
