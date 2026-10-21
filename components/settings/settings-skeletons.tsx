import { Skeleton, SkeletonButton, SkeletonField, SkeletonRegion } from "@/components/ui/skeleton";

const cardClassName = "sceenyk-card min-w-0 space-y-5 rounded-[var(--radius-xl)] border border-border bg-card p-5 sm:p-6";

export function AccountSettingsSkeleton({ security = false }: { security?: boolean }) {
  return <SkeletonRegion label={security ? "Loading security controls…" : "Loading your account…"} className={cardClassName}>
    {!security && <div className="flex items-center gap-4"><Skeleton className="size-8 shrink-0 rounded-full" /><div className="min-w-0 space-y-1"><Skeleton className="h-6 w-40 max-w-full" /><Skeleton className="h-5 w-52 max-w-full" /></div></div>}
    <Skeleton className="h-10 w-full" /><div className="flex flex-wrap gap-3"><SkeletonButton className="w-40" /><SkeletonButton className="w-24" /></div><div className="h-5" />
  </SkeletonRegion>;
}

export function CreationPreferencesSkeleton() {
  return <SkeletonRegion label="Loading creation defaults…" className={cardClassName}><div className="grid gap-5 sm:grid-cols-2"><SkeletonField /><SkeletonField /></div><SkeletonButton className="w-32" /></SkeletonRegion>;
}

export function CreatorProfileSkeleton() {
  return <SkeletonRegion label="Loading your creator profile…" className="space-y-6">
    <div className={cardClassName}><Skeleton className="h-7 w-56 max-w-full" /><Skeleton className="h-10 w-full" /><SkeletonField /><SkeletonField multiline /><Skeleton className="h-4 w-3/4" /><SkeletonField /><Skeleton className="h-8 w-full" /><SkeletonButton className="w-40" /></div>
    <div className={cardClassName}><Skeleton className="h-7 w-32" /><Skeleton className="size-24 rounded-full" /><Skeleton className="h-10 w-full" /><SkeletonField /><SkeletonButton className="w-40" /></div>
  </SkeletonRegion>;
}
