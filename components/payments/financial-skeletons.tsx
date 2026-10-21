import { Skeleton, SkeletonButton, SkeletonField, SkeletonRegion } from "@/components/ui/skeleton";

const cardClassName = "sceenyk-card min-w-0 space-y-3 rounded-[var(--radius-xl)] border border-border bg-card p-5 sm:p-6";

export function PurchaseSummarySkeleton() {
  return <SkeletonRegion label="Loading payment summary…" className="space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-6 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-8 w-full" /><SkeletonButton className="w-full" /><SkeletonButton className="w-full" /></SkeletonRegion>;
}

export function FinancialRowsSkeleton({ count = 3 }: { count?: number }) {
  return <SkeletonRegion label="Loading history…" className="divide-y divide-border">{Array.from({ length: count }, (_, i) => <div key={i} className="space-y-2 py-4"><div className="flex justify-between gap-4"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-5 w-1/4" /></div><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-32" /></div>)}</SkeletonRegion>;
}

export function CreditAccountSkeleton() {
  return <SkeletonRegion label="Loading your credit account…" className="space-y-6">
    <div className={`${cardClassName} flex flex-wrap items-center justify-between gap-4`}><div className="space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-9 w-24" /><Skeleton className="h-4 w-48" /><Skeleton className="h-4 w-48" /></div><SkeletonButton className="w-36" /></div>
    <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className={cardClassName}><Skeleton className="h-6 w-28 rounded-full" /><Skeleton className="size-6" /><Skeleton className="h-7 w-24" /><Skeleton className="h-9 w-32 max-w-full" /><Skeleton className="h-6 w-28" /><Skeleton className="h-12 w-full" /><SkeletonButton className="w-full" /></div>)}</div>
    <section className={cardClassName}><h2 className="text-lg font-semibold">Recent purchases</h2><FinancialRowsSkeleton /></section>
    <section className={cardClassName}><h2 className="text-lg font-semibold">Paid credit activity</h2><Skeleton className="h-8 w-full" /><FinancialRowsSkeleton /></section>
  </SkeletonRegion>;
}

export function PurchasesSkeleton() {
  return <SkeletonRegion label="Loading Marketplace purchases…" className="space-y-6"><SkeletonButton className="w-36" /><Skeleton className="h-10 w-full" />{[0, 1, 2].map(i => <div key={i} className={cardClassName}><Skeleton className="h-6 w-2/3" /><Skeleton className="h-5 w-1/2" /><Skeleton className="h-4 w-28" /><SkeletonButton className="w-36" /></div>)}</SkeletonRegion>;
}

export function EarningsSkeleton() {
  return <SkeletonRegion label="Loading earnings and payouts…" className="space-y-6">
    <SkeletonButton className="w-36" />
    <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className={cardClassName}><Skeleton className="h-5 w-3/4" /><Skeleton className="h-8 w-24" /></div>)}</div>
    <section className={cardClassName}><h2 className="text-xl font-semibold">Withdraw creator earnings</h2><Skeleton className="h-16 w-full" /><SkeletonField /><SkeletonButton className="w-36" /><Skeleton className="h-4 w-3/4" /><SkeletonField /><SkeletonButton className="w-28" /><div className="h-5" /></section>
    <section className="space-y-4"><h2 className="text-xl font-semibold">Withdrawal history</h2><div className={cardClassName}><FinancialRowsSkeleton count={2} /></div></section>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className={cardClassName}><Skeleton className="h-5 w-3/4" /><Skeleton className="h-8 w-24" /></div>)}</div>
    <div className={cardClassName}><FinancialRowsSkeleton /></div>
  </SkeletonRegion>;
}
