import { Skeleton, SkeletonField, SkeletonRegion } from "@/components/ui/skeleton";
import { FinancialRowsSkeleton } from "@/components/payments/financial-skeletons";

export function PayoutSupportSkeleton({ detail = false }: { detail?: boolean }) {
  return <SkeletonRegion label={detail ? "Loading withdrawal support…" : "Loading payout queue…"} className="space-y-6">
    <header className="space-y-3">{detail ? <><Skeleton className="h-5 w-40" /><Skeleton className="h-9 w-3/4" /><Skeleton className="h-5 w-48" /></> : <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Payout support</h1>}<Skeleton className="h-10 w-full max-w-2xl" /></header>
    {detail ? <div className="grid gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 15 }, (_, i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-5 w-3/4" /></div>)}</div> : <div className="grid gap-4 rounded-[var(--radius-xl)] border border-border bg-card p-6 sm:grid-cols-2 lg:grid-cols-4"><SkeletonField /><SkeletonField /><SkeletonField /><SkeletonField /></div>}
    <div className="rounded-[var(--radius-xl)] border border-border bg-card p-6"><FinancialRowsSkeleton count={detail ? 3 : 6} /></div>
  </SkeletonRegion>;
}
