import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: ComponentProps<"span">) {
  return <span {...props} aria-hidden="true" data-slot="skeleton" className={cn("block rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

export function SkeletonRegion({ label, children, className, ...props }: ComponentProps<"div"> & { label: string; children: ReactNode }) {
  return <div {...props} role="status" aria-busy="true" aria-label={label} data-skeleton="" className={cn("min-w-0", className)}>
    <span className="sr-only">{label}</span>{children}
  </div>;
}

export function SkeletonField({ multiline = false }: { multiline?: boolean }) {
  return <div className="min-w-0 space-y-2"><Skeleton className="h-4 w-32 max-w-full" /><Skeleton className={multiline ? "h-24 w-full" : "h-11 w-full [.workspace-settings-inner_&]:h-9 [@media(pointer:coarse)]:[.workspace-settings-inner_&]:h-11"} /></div>;
}

export function SkeletonButton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-11 [.workspace-settings-inner_&]:h-7 [@media(pointer:coarse)]:[.workspace-settings-inner_&]:h-11", className)} />;
}

export function MediaPreviewSkeleton({ className, overlay = false }: { className?: string; overlay?: boolean }) {
  return <span role="status" aria-busy="true" aria-label="Loading private preview…" data-skeleton="" className={cn("block overflow-hidden", overlay ? "absolute inset-0" : "relative", className ?? (overlay ? undefined : "aspect-video w-full rounded-lg"))}><span className="sr-only">Loading private preview…</span><Skeleton className="absolute inset-0 rounded-[inherit]" /></span>;
}
