"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePageFrame({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const studio = pathname === "/studio" || pathname.startsWith("/projects/");
  const detail = pathname.startsWith("/templates/") || (/^\/marketplace\/[^/]+$/.test(pathname) && pathname !== "/marketplace/purchases");
  const documentation = pathname === "/documentation" || pathname.startsWith("/documentation/");
  const settings = pathname === "/settings" || pathname.startsWith("/settings/");
  const view = settings ? "settings" : pathname === "/projects" ? "projects" : documentation ? "documentation" : pathname === "/templates" ? "templates" : pathname === "/marketplace" ? "marketplace" : detail ? "template-detail" : undefined;
  return <div data-workspace-page={studio ? "studio" : "content"} data-workspace-view={view} className={cn("workspace-page min-w-0", className)}>{children}</div>;
}
