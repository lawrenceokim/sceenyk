import Link from "next/link";
import { ArrowLeft, Plus, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { PurchasesRetryButton } from "./purchases-boundary";

export function PurchasesHeading() {
  return <header className="flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0 space-y-2"><h1 className="[&&&&]:text-[28px] [&&&&]:leading-9 font-semibold tracking-tight sm:[&&&&]:text-[30px]">My Purchases</h1>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Templates you’ve acquired from the Marketplace. Open one to review or create your own version.</p></div>
    <Button nativeButton={false} render={<Link href="/marketplace" />} className="h-auto min-h-10 shrink-0 rounded-lg px-3 py-2 text-xs [@media(pointer:coarse)]:min-h-11"><Plus aria-hidden="true" className="size-4" />Browse Marketplace</Button>
  </header>;
}
export function PurchasesBack() {
  return <Link href="/purchases" className="inline-flex min-h-8 w-fit items-center gap-2 rounded-lg bg-muted px-3 text-xs font-semibold outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11"><ArrowLeft aria-hidden="true" className="size-3.5" />Purchases</Link>;
}
export function PurchasesGridSkeleton() {
  return <SkeletonRegion label="Loading your purchases…" className="grid max-w-[1060px] grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
    {[0, 1, 2].map(key => <div key={key} className="space-y-3 rounded-xl border border-border bg-card p-2.5"><Skeleton className="aspect-video w-full rounded-lg" /><div className="space-y-3 px-1 pb-2"><Skeleton className="h-5 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-7 w-full" /><Skeleton className="h-6 w-4/5" /><Skeleton className="mt-5 h-8 w-full" /></div></div>)}
  </SkeletonRegion>;
}
export function PurchaseDetailSkeleton() {
  return <div className="@container/purchase-detail space-y-5"><PurchasesBack /><SkeletonRegion label="Loading purchased template…" className="grid items-start gap-7 @min-[850px]/purchase-detail:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
    <Skeleton className="aspect-[7/5] w-full rounded-xl" /><div className="space-y-4"><Skeleton className="h-8 w-3/4" /><Skeleton className="h-5 w-full" /><Skeleton className="h-7 w-1/2" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
  </SkeletonRegion></div>;
}
export function PurchasesFailure({ detail = false }: { detail?: boolean }) {
  return <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-6"><ShoppingBag aria-hidden="true" className="size-6 text-primary" />
    <h2 className="text-base font-semibold">{detail ? "This purchase couldn’t be loaded" : "Your purchases couldn’t be loaded"}</h2>
    <p className="text-sm text-muted-foreground">Refresh to try again. Your saved purchases are unchanged.</p>
    <div className="flex flex-wrap items-center gap-3"><PurchasesRetryButton /><Link href="/purchases" className="text-xs font-medium text-link underline-offset-4 hover:underline">Return to purchases</Link></div>
  </div>;
}
