import { Skeleton, SkeletonField, SkeletonRegion } from "@/components/ui/skeleton";
import { StudioLayout } from "./studio-layout";

// Use the real panel owner so its viewport, scroll, and Sources modes stay aligned.
export function StudioSkeleton() {
  return <StudioLayout
    sources={<SkeletonRegion label="Loading project sources…" className="space-y-5"><SkeletonField /><SkeletonField /><div className="flex gap-2"><Skeleton className="size-14" /><Skeleton className="size-14" /></div><SkeletonField /></SkeletonRegion>}
    toolbar={<div className="flex min-w-0 flex-1 items-center justify-between gap-3" aria-hidden="true"><Skeleton className="h-8 w-28" /><Skeleton className="h-8 w-16" /></div>}
    stage={<SkeletonRegion label="Loading your workspace…" className="flex h-full min-h-0 items-center justify-center overflow-hidden"><Skeleton className="aspect-video max-h-full w-full rounded-xl" /></SkeletonRegion>}
    properties={<SkeletonRegion label="Loading project properties…" className="space-y-6"><SkeletonField multiline /><SkeletonField /><SkeletonField /><SkeletonField /><Skeleton className="h-11 w-full" /></SkeletonRegion>}
  />;
}

