"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Coins,
  FolderOpen,
  House,
  Layers3,
  Menu,
  Settings2,
  Sparkles,
  Store,
  UserRound,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const destinations = [
  { label: "Home", icon: House, href: "/dashboard" },
  { label: "Create", icon: Sparkles, href: "/create" },
  { label: "Projects", icon: FolderOpen, href: "/dashboard#projects" },
  { label: "Templates", icon: Layers3, href: "/dashboard#templates" },
  { label: "Marketplace", icon: Store },
  { label: "Credits", icon: Coins, href: "/dashboard#credits" },
  { label: "Settings", icon: Settings2 },
] as const;

function DashboardNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Workspace navigation" className="space-y-1.5">
      {destinations.map((item) => {
        const Icon = item.icon;
        const classes =
          "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-body-sm font-medium";
        if (!("href" in item))
          return (
            <span
              key={item.label}
              aria-disabled="true"
              className={cn(classes, "text-muted-foreground")}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              {item.label}
              <span className="ml-auto text-caption font-normal">Soon</span>
            </span>
          );
        const active = item.href === pathname;
        return (
          <Link
            key={item.label}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={onNavigate}
            className={cn(
              classes,
              "transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none",
              active && "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountPreview() {
  return (
    <div className="space-y-4 border-t border-sidebar-border p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <UserRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-body-sm font-medium">Your account</p>
          <p className="mt-1 text-caption leading-relaxed text-muted-foreground">
            Account access is coming soon.
          </p>
        </div>
      </div>
      <AccountAction intent="sign-in" variant="outline" className="w-full">
        Sign in
      </AccountAction>
    </div>
  );
}

export function DashboardSidebar() {
  return (
    <aside
      aria-label="Dashboard sidebar"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex"
    >
      <div className="px-5 pb-6 pt-5">
        <Brand />
        <p className="mt-1 text-caption text-muted-foreground">
          Your creative workspace
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <DashboardNavigation />
      </div>
      <AccountPreview />
    </aside>
  );
}

export function DashboardMobileNavigation() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    function dismissOnDesktop() {
      if (desktop.matches) setOpen(false);
    }
    desktop.addEventListener("change", dismissOnDesktop);
    return () => desktop.removeEventListener("change", dismissOnDesktop);
  }, []);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open workspace navigation"
          />
        }
      >
        <Menu className="size-5" aria-hidden="true" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="gap-0 overflow-y-auto bg-sidebar text-sidebar-foreground data-[side=left]:w-[min(20rem,calc(100%-1rem))]"
      >
        <div className="px-5 pb-6 pt-5 pr-16">
          <Brand onNavigate={() => setOpen(false)} />
        </div>
        <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
        <SheetDescription className="sr-only">
          Explore the Sceenyk dashboard or open the creation workspace.
        </SheetDescription>
        <div className="flex-1 px-3 pb-6">
          <DashboardNavigation onNavigate={() => setOpen(false)} />
        </div>
        <AccountPreview />
      </SheetContent>
    </Sheet>
  );
}
