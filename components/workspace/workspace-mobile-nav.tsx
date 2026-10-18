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
  return <header className="workspace-mobile-header sticky top-0 z-40 flex h-[50px] items-center gap-2 border-b border-border bg-background px-2 lg:hidden">
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open workspace navigation" />}><Menu className="size-5" aria-hidden="true" /></SheetTrigger>
      <SheetContent side="left" className="workspace-drawer gap-0 bg-sidebar text-sidebar-foreground data-[side=left]:w-[min(26rem,76vw)] data-[side=left]:max-w-none">
        <div className="workspace-brand shrink-0 pr-16"><Brand variant="full" onNavigate={() => setOpen(false)} /></div>
        <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
        <SheetDescription className="sr-only">Open Studio, Projects, Templates, Marketplace, Documentation, Credits or Settings.</SheetDescription>
        <div className="workspace-nav-scroll min-h-0 flex-1 overflow-y-auto"><WorkspaceNavigation onNavigate={() => setOpen(false)} /></div>
        <WorkspaceUserMenu onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
    <Brand variant="full" />
  </header>;
}
