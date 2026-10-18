"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { WorkspaceNavigation } from "./workspace-navigation";
import { WorkspaceUserMenu } from "./workspace-user-menu";

export function WorkspaceMobileNav() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const desktop = matchMedia("(min-width: 1024px)");
    const dismiss = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", dismiss);
    return () => desktop.removeEventListener("change", dismiss);
  }, []);
  return <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background px-3 lg:hidden">
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open workspace navigation" />}><Menu className="size-5" aria-hidden="true" /></SheetTrigger>
      <SheetContent side="left" className="gap-0 bg-sidebar text-sidebar-foreground data-[side=left]:w-[min(19rem,calc(100%-1rem))]">
        <div className="shrink-0 px-5 pb-5 pt-5 pr-16"><Brand variant="full" onNavigate={() => setOpen(false)} /></div>
        <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
        <SheetDescription className="sr-only">Open Studio, your projects, Marketplace or Settings. Templates and Documentation are planned.</SheetDescription>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-5"><WorkspaceNavigation onNavigate={() => setOpen(false)} /></div>
        <WorkspaceUserMenu onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
    <Brand variant="compact" /><span className="text-body-sm font-semibold">Workspace</span>
  </header>;
}
