"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePageFrame({ children, className }: { children: ReactNode; className?: string }) {
  const pathname = usePathname();
  const studio = pathname === "/create" || pathname.startsWith("/projects/");
  return <div className={cn(studio ? "min-w-0 p-1" : "min-w-0 space-y-8 p-4 sm:p-6 lg:p-8 xl:p-10", className)}>{children}</div>;
}
