import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

export const marketplaceGridClassName = "workspace-gallery marketplace-gallery [[data-workspace-shell]_&&]:grid [[data-workspace-shell]_&&]:[grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr))] [[data-workspace-shell]_&&]:gap-[16px] max-599:[[data-workspace-shell]_&&]:[grid-template-columns:repeat(2,minmax(0,1fr))] max-599:[[data-workspace-shell]_&&]:gap-[8px] max-359:[[data-workspace-shell]_&&]:[grid-template-columns:minmax(0,1fr)] [[data-workspace-shell]_.workspace-gallery&&]:[grid-template-columns:repeat(auto-fill,_minmax(min(100%,_180px),_1fr))] [[data-workspace-shell]_.workspace-gallery&&]:gap-[16px] max-767:[[data-workspace-shell]_.workspace-gallery&&]:[grid-template-columns:minmax(0,_1fr)] max-599:[[data-workspace-shell]_.workspace-gallery&&]:gap-[16px]";
export const creatorGridClassName = "workspace-gallery [[data-workspace-shell]_&&]:grid [[data-workspace-shell]_&&]:[grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr))] [[data-workspace-shell]_&&]:gap-[16px] max-599:[[data-workspace-shell]_&&]:[grid-template-columns:repeat(2,minmax(0,1fr))] max-599:[[data-workspace-shell]_&&]:gap-[8px] max-359:[[data-workspace-shell]_&&]:[grid-template-columns:minmax(0,1fr)]";
export const managementGridClassName = "manage-template-gallery [&&]:grid [&&]:[grid-template-columns:repeat(auto-fill,_minmax(min(100%,_200px),_1fr))] [&&]:items-stretch [&&]:gap-[16px] max-599:[&&]:[grid-template-columns:minmax(0,_1fr)]";
export const templateLibraryGridClassName = "template-saved-gallery [&&]:grid [&&]:[grid-template-columns:repeat(auto-fill,_minmax(min(100%,_206px),_206px))] [&&]:gap-[16px] max-767:[&&]:[grid-template-columns:minmax(0,_1fr)]";
export const moreLooksGridClassName = "workspace-gallery marketplace-gallery marketplace-more-grid [[data-workspace-shell]_&&]:grid [[data-workspace-shell]_&&]:[grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr))] [[data-workspace-shell]_&&]:gap-[16px] max-599:[[data-workspace-shell]_&&]:[grid-template-columns:repeat(2,minmax(0,1fr))] max-599:[[data-workspace-shell]_&&]:gap-[8px] max-359:[[data-workspace-shell]_&&]:[grid-template-columns:minmax(0,1fr)] [[data-workspace-shell]_.workspace-gallery&&]:[grid-template-columns:repeat(auto-fill,_minmax(min(100%,_180px),_1fr))] [[data-workspace-shell]_.workspace-gallery&&]:gap-[16px] max-767:[[data-workspace-shell]_.workspace-gallery&&]:[grid-template-columns:minmax(0,_1fr)] max-599:[[data-workspace-shell]_.workspace-gallery&&]:gap-[16px] [[data-workspace-shell]_.workspace-gallery&&]:[grid-template-columns:repeat(4,_minmax(0,_1fr))] [[data-workspace-shell]_.workspace-gallery&&]:gap-[24px] container-max-859:[[data-workspace-shell]_.workspace-gallery&&]:[grid-template-columns:repeat(2,_minmax(0,_1fr))] container-max-859:[[data-workspace-shell]_.workspace-gallery&&]:gap-[16px]";

export function SavedCardSkeleton() {
  return <div className="min-w-0 rounded-[13px] border border-border bg-card p-[10px]">
    <Skeleton className="aspect-[4/3] w-full rounded-[9px]" />
    <Skeleton className="mx-1 mt-[10px] h-[18px] w-3/4" />
    <Skeleton className="mx-1 mt-0.5 h-4 w-1/2" />
    <Skeleton className="mt-2 h-[30px] w-full [@media(pointer:coarse)]:h-11" />
  </div>;
}

export function GalleryCardSkeleton({ management = false }: { management?: boolean }) {
  return <div className="min-w-0 overflow-hidden rounded-[18px] border border-border bg-card p-2">
    <Skeleton className="aspect-[4/3] w-full rounded-xl" />
    <div className="space-y-1.5 px-[3px] pb-0.5 pt-[10px]">
      <Skeleton className="h-[18px] w-3/4" />
      <Skeleton className="h-8 w-full" />
      {management ? <><div className="grid grid-cols-3 gap-2 py-2">{[0, 1, 2].map(i => <Skeleton key={i} className="h-9 w-full" />)}</div><Skeleton className="h-8 w-full [@media(pointer:coarse)]:h-11" /></>
        : <div className="flex gap-1 pt-[3px]"><Skeleton className="h-5 w-16 rounded-full" /><Skeleton className="h-5 w-12 rounded-full" /></div>}
    </div>
  </div>;
}

export function GallerySkeleton({ variant = "marketplace", count = 6, label = "Loading templates…" }: {
  variant?: "marketplace" | "management" | "library" | "creator" | "related"; count?: number; label?: string;
}) {
  const className = { marketplace: marketplaceGridClassName, management: managementGridClassName, library: templateLibraryGridClassName, creator: creatorGridClassName, related: moreLooksGridClassName }[variant];
  return <SkeletonRegion label={label} id={variant === "library" ? "templates" : undefined}>
    <div className={className}>{Array.from({ length: count }, (_, i) => variant === "library" ? <SavedCardSkeleton key={i} /> : <GalleryCardSkeleton key={i} management={variant === "management"} />)}</div>
  </SkeletonRegion>;
}

export function ProjectPickerSkeleton() {
  return <SkeletonRegion label="Loading your projects…" className="space-y-5">
    <Skeleton className="h-5 w-full max-w-lg" />
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map(i => <div key={i} className="overflow-hidden rounded-xl border border-border bg-card"><Skeleton className="aspect-[4/3] rounded-none" /><div className="space-y-1 p-3"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-8 w-32" /></div></div>)}</div>
  </SkeletonRegion>;
}

export function MarketplaceDiscoverySkeleton() {
  return <div className="space-y-10"><div className="flex flex-wrap gap-2" aria-hidden="true">{Array.from({ length: 7 }, (_, i) => <Skeleton key={i} className="h-[26px] w-24 rounded-full" />)}</div><GallerySkeleton /></div>;
}
