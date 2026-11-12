"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Store } from "lucide-react";
import { creationCategories } from "@/components/creation/creation-options";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { AppNotification } from "@/components/notifications/app-notification";
import { categoryIds, type CategoryId } from "@/lib/projects/options";
import { MarketplaceFailure, MarketplaceLoading } from "./listing-card";
import { MarketplaceInfiniteGallery } from "./infinite-gallery";
import { MarketplaceCacheScope, MarketplaceIdentity, useMarketplaceGallery } from "./gallery-cache";

function DiscoveryResults({ query, category, page }: { query: string; category: CategoryId | null; page: number }) {
  const { snapshot: result, scope, marker, failed, retry } = useMarketplaceGallery({ query, category, page });
  if (!result) return failed ? <><MarketplaceFailure /><button type="button" onClick={retry} className="min-h-11 text-body-sm underline">Try again</button></> : <MarketplaceLoading />;
  return <MarketplaceCacheScope.Provider value={scope}><div ref={marker}>
      {failed && <AppNotification role="status">Marketplace couldn’t be refreshed. Showing your saved cards.</AppNotification>}
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
        <MarketplaceInfiniteGallery key={`${query}:${category ?? "all"}:${page}`} snapshot={result} scope={scope} filter={{ query, category, page }} />
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
  </div></MarketplaceCacheScope.Provider>;
}

export function MarketplaceDiscovery() {
  return <MarketplaceIdentity><Discovery /></MarketplaceIdentity>;
}
function Discovery() {
  const params = useSearchParams();
  const q = params.get("q"), selectedCategory = params.get("category"), selectedPage = params.get("page");
  const query =
    typeof q === "string" ? q.trim().slice(0, 80) : "";
  const category = categoryIds.includes(selectedCategory as CategoryId)
    ? (selectedCategory as CategoryId)
    : null;
  const page =
    typeof selectedPage === "string" && /^\d{1,6}$/.test(selectedPage)
      ? Math.max(1, Math.min(100000, Number(selectedPage)))
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
      <DiscoveryResults key={JSON.stringify({ query, category, page })} query={query} category={category} page={page} />
    </div>
  );
}
