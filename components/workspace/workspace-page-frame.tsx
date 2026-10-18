import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function WorkspacePageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("min-w-0 space-y-8 p-4 sm:p-6 lg:p-8 xl:p-10", className)}>{children}</div>;
}
