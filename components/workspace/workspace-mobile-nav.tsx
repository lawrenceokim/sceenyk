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
  return <header className={`
      workspace-mobile-header sticky top-0 z-40 flex h-[50px] items-center gap-2 border-b border-border bg-background px-2
      lg:hidden max-1023:[&&]:gap-[0]
      max-1023:[&&_[aria-label='Open_workspace_navigation']]:w-[var(--workspace-control-height)]
      max-1023:[&&_[aria-label='Open_workspace_navigation']]:h-[var(--workspace-control-height)]
      max-1023:[&&_[aria-label='Open_workspace_navigation']_svg]:w-[16px]
      max-1023:[&&_[aria-label='Open_workspace_navigation']_svg]:h-[16px] max-1023:[&&_>_a_img]:w-[112px]
      max-1023:[&&_>_a_img]:h-[auto] max-1023:[&&_>_a_img]:object-contain
    `}>
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Open workspace navigation" />}><Menu className="size-5" aria-hidden="true" /></SheetTrigger>
      <SheetContent side="left" className="workspace-drawer gap-0 bg-sidebar text-sidebar-foreground data-[side=left]:w-[min(26rem,76vw)] data-[side=left]:max-w-none">
        <div className={`
      workspace-brand shrink-0 pr-16 [&&]:h-[100px] [&&]:pt-[24px] [&&]:pr-[16px] [&&]:pb-[24px] [&&]:pl-[16px] [&&]:flex
      [&&]:items-center [&&]:shrink-0 [&&_a]:justify-start [&&_img]:w-[140px] [&&_img]:max-w-[100%] [&&_img]:h-[auto]
      [&&_img]:object-contain [&&_img]:[object-position:left_center] [[data-collapsed='true']_&&]:justify-center
      [[data-collapsed='true']_&&]:pl-[12px] [[data-collapsed='true']_&&]:pr-[12px] [[data-collapsed='true']_&&_img]:w-[36px]
      max-1023:[.workspace-drawer_&&]:h-[88px]
    `}><Brand variant="full" onNavigate={() => setOpen(false)} /></div>
        <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
        <SheetDescription className="sr-only">Open Studio, Projects, Templates, Marketplace, Documentation, Credits or Settings.</SheetDescription>
        <div className={"workspace-nav-scroll min-h-0 flex-1 overflow-y-auto [&&]:pt-[8px] [&&]:pr-[8px] [&&]:pb-[8px] [&&]:pl-[8px]"}><WorkspaceNavigation onNavigate={() => setOpen(false)} /></div>
        <WorkspaceUserMenu onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
    <Brand variant="full" />
  </header>;
}
