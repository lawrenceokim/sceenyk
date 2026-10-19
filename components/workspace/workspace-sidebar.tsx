"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brand } from "@/components/brand";
import { WorkspaceNavigation, WorkspaceTooltip } from "./workspace-navigation";
import { WorkspaceUserMenu } from "./workspace-user-menu";

export function WorkspaceSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return <aside aria-label="Workspace sidebar" className="fixed inset-y-0 left-0 z-40 hidden w-[var(--workspace-sidebar-width)] flex-col bg-background text-sidebar-foreground lg:flex">
    <div className={`
      workspace-brand [&&]:h-[100px] [&&]:pt-[24px] [&&]:pr-[16px] [&&]:pb-[24px] [&&]:pl-[16px] [&&]:flex [&&]:items-center
      [&&]:shrink-0 [&&_a]:justify-start [&&_img]:w-[140px] [&&_img]:max-w-[100%] [&&_img]:h-[auto] [&&_img]:object-contain
      [&&_img]:[object-position:left_center] [[data-collapsed='true']_&&]:justify-center
      [[data-collapsed='true']_&&]:pl-[12px] [[data-collapsed='true']_&&]:pr-[12px] [[data-collapsed='true']_&&_img]:w-[36px]
      max-1023:[.workspace-drawer_&&]:h-[88px]
    `}><Brand variant={collapsed ? "compact" : "full"} /></div>
    <div className={"workspace-nav-scroll min-h-0 flex-1 overflow-y-auto [&&]:pt-[8px] [&&]:pr-[8px] [&&]:pb-[8px] [&&]:pl-[8px]"}><WorkspaceNavigation collapsed={collapsed} /></div>
    <div className={`
      workspace-collapse [&&]:shrink-0 [&&]:pt-[8px] [&&]:pr-[8px] [&&]:pb-[8px] [&&]:pl-[8px] [&&_button]:h-[32px]
      [&&_button]:pt-[0] [&&_button]:pr-[8px] [&&_button]:pb-[0] [&&_button]:pl-[8px]
      [[data-collapsed='true']_&&_button]:justify-center [[data-collapsed='true']_&&_button]:pt-[0]
      [[data-collapsed='true']_&&_button]:pr-[0] [[data-collapsed='true']_&&_button]:pb-[0]
      [[data-collapsed='true']_&&_button]:pl-[0]
    `}><WorkspaceTooltip label={label} enabled={collapsed}><button type="button" aria-label={label} aria-expanded={!collapsed} onClick={onToggle} className="flex w-full items-center gap-2 rounded-lg text-body-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-ring">{collapsed ? <PanelLeftOpen className="size-4" aria-hidden="true" /> : <><PanelLeftClose className="size-4" aria-hidden="true" />Collapse</>}</button></WorkspaceTooltip></div>
    <WorkspaceUserMenu collapsed={collapsed} />
  </aside>;
}
