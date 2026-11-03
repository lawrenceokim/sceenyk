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
      <div
        aria-hidden="true"
        className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4"
      >
        <div className="space-y-3">
          <Skeleton className="h-4 w-44 max-w-full" />
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }, (_, index) => (
              <div key={index} className="min-w-0 space-y-2">
                <Skeleton className="h-3 w-16 max-w-full" />
                <Skeleton className="h-4 w-24 max-w-full" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3 rounded-lg bg-muted/40 p-3">
          <Skeleton className="h-3.5 w-36 max-w-full" />
          <Skeleton className="h-6 w-24 max-w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-44 max-w-full" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex min-w-0 items-start gap-2">
            <Skeleton className="size-4 shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
          <Skeleton className="h-11 w-56 max-w-full rounded-lg" />
        </div>
      </div>
    </SkeletonRegion>
  );
}
