import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Skeleton, SkeletonButton, SkeletonField, SkeletonRegion } from "@/components/ui/skeleton";
import { GallerySkeleton } from "./gallery-skeletons";

export function TemplateDetailSkeleton({ owned = false }: { owned?: boolean }) {
  return <div className="marketplace-detail @container min-w-0 px-6 pb-8 pt-[54px] max-1023:pt-10 max-599:px-4 max-599:pb-6">
    <Link href={owned ? "/templates" : "/marketplace"} className="mb-6 inline-flex min-h-6 items-center gap-[5px] rounded-[7px] bg-muted px-2 py-[3px] text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring"><ArrowLeft className="size-3" aria-hidden="true" />{owned ? "Templates" : "Marketplace"}</Link>
    <SkeletonRegion label="Loading template…" className="grid min-w-0 items-start gap-9 @min-[860px]:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)] @min-[860px]:gap-10">
      <Skeleton className="aspect-square w-full rounded-xl" />
      <div className="min-w-0 space-y-[18px]"><Skeleton className="h-[35px] w-3/4" /><Skeleton className="h-[72px] w-full" /><div className="flex gap-1"><Skeleton className="h-6 w-16 rounded-full" /><Skeleton className="h-6 w-20 rounded-full" /></div><Skeleton className="h-7 w-36" /><Skeleton className="h-5 w-full" /><SkeletonButton className="w-full" /><div className="flex items-center gap-2"><Skeleton className="size-7 shrink-0 rounded-full" /><Skeleton className="h-5 w-32" /></div></div>
    </SkeletonRegion>
  </div>;
}

export function ListingEditorSkeleton() {
  return <SkeletonRegion label="Loading template details…" className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
    <div className="sceenyk-card min-w-0 space-y-5 rounded-[var(--radius-xl)] border border-border bg-card p-5 sm:p-7"><Skeleton className="h-7 w-40" /><Skeleton className="h-16 w-full" /><SkeletonField /><SkeletonField multiline /><div className="grid gap-5 sm:grid-cols-2"><SkeletonField /><SkeletonField /></div><SkeletonField multiline /><div className="space-y-3 rounded-xl border border-border p-4"><SkeletonField /><Skeleton className="h-16 w-full" /></div><Skeleton className="h-24 w-full" /><SkeletonButton className="w-full" /></div>
    <div className="overflow-hidden rounded-[var(--radius-xl)] border border-border bg-card"><Skeleton className="aspect-video min-h-[280px] w-full rounded-none" /><div className="space-y-3 p-5"><Skeleton className="h-7 w-40" /><Skeleton className="h-24 w-full" /></div></div>
  </SkeletonRegion>;
}

export function CreatorStorefrontSkeleton() {
  return <div className="space-y-8"><SkeletonRegion label="Loading creator profile…" className="flex flex-col gap-6 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:flex-row sm:p-8"><Skeleton className="size-24 shrink-0 rounded-full" /><div className="min-w-0 flex-1 space-y-3"><Skeleton className="h-4 w-36" /><Skeleton className="h-10 w-64 max-w-full" /><Skeleton className="h-5 w-32" /><Skeleton className="h-12 w-full max-w-2xl" /><div className="flex gap-6">{[0, 1, 2].map(i => <Skeleton key={i} className="h-12 w-28 max-w-[30%]" />)}</div></div></SkeletonRegion><section className="space-y-6"><h2 className="text-2xl font-semibold tracking-tight">Published templates</h2><GallerySkeleton variant="creator" /></section></div>;
}
