import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

export function V3PackageSkeleton() {
  return (
    <SkeletonRegion
      label="Preparing your package and estimate…"
      className="w-full space-y-3"
    >
      <p aria-hidden="true" className="text-sm font-medium text-primary">
        Preparing your package and estimate…
      </p>
      <div aria-hidden="true" className="min-w-0 space-y-3">
        <div className="flex min-w-0 flex-wrap gap-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-7 w-24 max-w-full rounded-lg" />
          ))}
        </div>
        <div className="min-w-0 space-y-3 rounded-xl border border-primary/20 bg-card p-4">
          <div className="flex flex-wrap items-center gap-4">
            <Skeleton className="h-3.5 w-36 max-w-full" />
            <Skeleton className="h-6 w-24 max-w-full" />
          </div>
          <div className="space-y-2 border-t border-primary/15 pt-3">
            <Skeleton className="h-3.5 w-40 max-w-full" />
            <Skeleton className="h-11 w-full rounded-lg sm:w-1/2" />
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
          <div className="space-y-3 border-t border-primary/15 pt-3">
            <div className="flex min-w-0 items-start gap-2">
              <Skeleton className="size-4 shrink-0" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
            </div>
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="mx-auto h-3 w-3/4" />
          </div>
        </div>
      </div>
    </SkeletonRegion>
  );
}
