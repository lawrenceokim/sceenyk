"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Brand } from "@/components/brand";
import { WorkspaceNavigation, WorkspaceTooltip } from "./workspace-navigation";
import { WorkspaceUserMenu } from "./workspace-user-menu";

export function WorkspaceSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar";
  return <aside aria-label="Workspace sidebar" className="fixed inset-y-0 left-0 z-40 hidden w-[var(--workspace-sidebar-width)] flex-col bg-background text-sidebar-foreground lg:flex">
    <div className="flex h-24 shrink-0 items-center justify-center px-4"><Brand variant={collapsed ? "compact" : "full"} /></div>
    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6"><WorkspaceNavigation collapsed={collapsed} /></div>
    <div className="px-3 pb-3"><WorkspaceTooltip label={label} enabled={collapsed}><button type="button" aria-label={label} aria-expanded={!collapsed} onClick={onToggle} className="flex min-h-11 w-full items-center justify-center gap-3 rounded-xl text-body-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-2 focus-visible:outline-ring">{collapsed ? <PanelLeftOpen className="size-[18px]" aria-hidden="true" /> : <><PanelLeftClose className="size-[18px]" aria-hidden="true" />Collapse sidebar</>}</button></WorkspaceTooltip></div>
    <WorkspaceUserMenu collapsed={collapsed} />
  </aside>;
}
