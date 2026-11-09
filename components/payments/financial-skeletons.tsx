import { Skeleton, SkeletonButton, SkeletonRegion } from "@/components/ui/skeleton";

const cardClassName = "sceenyk-card min-w-0 space-y-3 rounded-[var(--radius-xl)] border border-border bg-card p-5 sm:p-6";

export function PurchaseSummarySkeleton() {
  return <SkeletonRegion label="Loading payment summary…" className="space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-6 w-40" /><Skeleton className="h-10 w-full" /><Skeleton className="h-8 w-full" /><SkeletonButton className="w-full" /><SkeletonButton className="w-full" /></SkeletonRegion>;
}

export function FinancialRowsSkeleton({ count = 3 }: { count?: number }) {
  return <SkeletonRegion label="Loading history…" className="divide-y divide-border">{Array.from({ length: count }, (_, i) => <div key={i} className="space-y-2 py-4"><div className="flex justify-between gap-4"><Skeleton className="h-5 w-2/5" /><Skeleton className="h-5 w-1/4" /></div><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-32" /></div>)}</SkeletonRegion>;
}

export function CreditAccountSkeleton({ dashboard = false }: { dashboard?: boolean }) {
  if (dashboard) return <SkeletonRegion label="Loading your credit account…" className="@container/billing grid min-w-0 gap-5">
    <div className="grid grid-cols-2 gap-5 rounded-[14px] border border-primary/25 bg-primary/[0.03] p-5 @min-[760px]/billing:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="grid gap-2"><Skeleton className="h-4 w-32 max-w-full" /><Skeleton className="h-7 w-24 max-w-full" /></div>)}</div>
    <div className="grid gap-4 @min-[680px]/billing:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="grid gap-3 rounded-[14px] border border-border bg-card p-5"><Skeleton className="h-7 w-32 rounded-full" /><Skeleton className="h-7 w-40 max-w-full" /><Skeleton className="h-7 w-28" /><Skeleton className="h-5 w-36 max-w-full" /><Skeleton className="h-12 w-full" /><SkeletonButton className="w-full" /></div>)}</div>
    <div className="grid gap-4 @min-[800px]/billing:grid-cols-2">{[0, 1].map(i => <div key={i} className="rounded-[14px] border border-border bg-card p-5"><Skeleton className="h-6 w-40" /><FinancialRowsSkeleton count={2} /></div>)}</div>
    <div className="flex gap-5 rounded-[14px] border border-border bg-card p-5"><Skeleton className="size-16 shrink-0 rounded-[18px]" /><div className="grid w-full gap-2"><Skeleton className="h-6 w-64 max-w-full" /><Skeleton className="h-5 w-72 max-w-full" /><Skeleton className="h-4 w-full" /></div></div>
  </SkeletonRegion>;
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
  return <SkeletonRegion label="Loading earnings and payouts…" className="@container/earnings grid min-w-0 gap-4">
    <div className="grid grid-cols-2 gap-5 rounded-[14px] border border-primary/25 bg-primary/[0.03] p-5 @min-[720px]/earnings:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="grid gap-2"><Skeleton className="h-4 w-28 max-w-full" /><Skeleton className="h-6 w-20" /></div>)}</div>
    <div className="grid gap-3 @min-[360px]/earnings:grid-cols-2 @min-[760px]/earnings:grid-cols-4">{[0, 1, 2, 3].map(i => <div key={i} className="flex gap-3 rounded-[14px] border border-border bg-card p-4"><Skeleton className="size-11 shrink-0 rounded-xl" /><div className="grid min-w-0 gap-2"><Skeleton className="h-3 w-28 max-w-full" /><Skeleton className="h-5 w-16" /></div></div>)}</div>
    <div className="grid gap-4 @min-[680px]/earnings:grid-cols-2">{[0, 1].map(i => <div key={i} className="grid gap-3 rounded-[14px] border border-border bg-card p-4"><div className="flex gap-3"><Skeleton className="size-11 shrink-0 rounded-xl" /><div className="grid min-w-0 gap-2"><Skeleton className="h-4 w-40 max-w-full" /><Skeleton className="h-3 w-48 max-w-full" /></div></div><Skeleton className="h-9 w-full" /><Skeleton className="h-8 w-full" /><Skeleton className="h-7 w-36" /></div>)}</div>
    <div className="grid gap-4 @min-[680px]/earnings:grid-cols-2">{[0, 1].map(i => <div key={i} className="grid justify-items-center gap-3 rounded-[14px] border border-border bg-card p-4"><Skeleton className="h-5 w-36 justify-self-start" /><Skeleton className="h-16 w-24 rounded-xl" /><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-4/5" /></div>)}</div>
  </SkeletonRegion>;
}
