import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

export function V3FinalVideoSkeleton() {
  return (
    <SkeletonRegion label="Preparing your final video…" className="w-full space-y-3">
      <div aria-hidden="true" className="min-w-0 space-y-4 rounded-xl border border-border bg-card p-4">
        <Skeleton className="aspect-video w-full rounded-lg" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="space-y-2 rounded-lg bg-muted/40 p-3">
          <Skeleton className="h-3 w-36 max-w-full" />
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
        <div className="flex min-w-0 flex-wrap gap-2">
          <Skeleton className="h-11 w-40 max-w-full rounded-lg" />
          <Skeleton className="h-11 w-32 max-w-full rounded-lg" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
