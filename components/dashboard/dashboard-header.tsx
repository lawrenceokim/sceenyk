import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { DashboardMobileNavigation } from "./dashboard-sidebar";

export function DashboardHeader({
  title = "Dashboard",
  description = "Your imagination, all in one place.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-xl">
      <div className="sceenyk-container flex min-h-20 items-center justify-between gap-2 py-3 sm:gap-4">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <DashboardMobileNavigation />
          <div className="min-w-0">
            <p className="text-body-sm font-semibold sm:text-body">{title}</p>
            <p className="mt-1 hidden text-caption text-muted-foreground sm:block">
              {description}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-3">
          <ThemeToggle />
          <Button
            nativeButton={false}
            render={<Link href="/create" />}
            className="px-3 sm:px-4"
          >
            <Plus className="size-4" aria-hidden="true" />
            Create
          </Button>
        </div>
      </div>
    </header>
  );
}
