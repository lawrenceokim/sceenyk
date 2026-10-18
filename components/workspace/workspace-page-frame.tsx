"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePageFrame({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const studio = pathname === "/create" || pathname.startsWith("/projects/");
  return <div data-workspace-page={studio ? "studio" : "content"} className={cn("workspace-page min-w-0", className)}>{children}</div>;
}
