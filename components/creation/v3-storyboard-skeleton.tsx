import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";

export function V3StoryboardSkeleton() {
  return (
    <SkeletonRegion
      label="Creating your storyboard…"
      className="w-full space-y-3"
    >
      <p aria-hidden="true" className="text-sm font-medium text-primary">
        Creating your storyboard…
      </p>
      <div
        aria-hidden="true"
        className="min-w-0 space-y-5 rounded-xl border border-border bg-card p-4"
      >
        <div className="space-y-3">
          <Skeleton className="h-3 w-44 max-w-full" />
          <Skeleton className="h-5 w-3/4" />
          <div className="space-y-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-5/6" />
          </div>
        </div>
        <div className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 py-2">
          <Skeleton className="h-3.5 w-40 max-w-full" />
          <Skeleton className="size-4 shrink-0" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className="flex min-w-0 items-start gap-3 rounded-xl border border-border p-3 sm:p-4"
            >
              <Skeleton className="mt-0.5 size-6 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Skeleton className="h-3.5 w-16 max-w-full" />
                  <Skeleton className="h-3 w-20 max-w-full" />
                </div>
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
              </div>
              <Skeleton className="mt-1 size-4 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonRegion>
  );
}
