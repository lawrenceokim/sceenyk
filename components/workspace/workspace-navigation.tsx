"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clapperboard, Coins, FolderOpen, LayoutTemplate, Settings2, Store } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { useId, type ReactElement } from "react";
import { cn } from "@/lib/utils";

const groups = [
  { label: "Studio", items: [{ label: "Studio", icon: Clapperboard, href: "/studio" }] },
  { label: "Workspace", items: [
    { label: "Projects", icon: FolderOpen, href: "/projects" },
    { label: "Templates", icon: LayoutTemplate, href: "/templates" },
  ] },
  { label: "Discover", items: [{ label: "Marketplace", icon: Store, href: "/marketplace" }] },
  { label: "Resources", items: [{ label: "Documentation", icon: BookOpen, href: "/documentation" }] },
  { label: "Account", items: [
    { label: "Credits", icon: Coins, href: "/settings/credits" },
    { label: "Settings", icon: Settings2, href: "/settings/account" },
  ] },
] as const;

export function WorkspaceTooltip({ label, children, enabled = true }: {
  label: string; children: ReactElement; enabled?: boolean;
}) {
  const id = useId();
  if (!enabled) return children;
  return <Tooltip.Root><Tooltip.Trigger render={children} aria-describedby={id} />
    <Tooltip.Portal><Tooltip.Positioner side="right" sideOffset={12} className="z-[70]">
      <Tooltip.Popup id={id} role="tooltip" className="rounded-lg border border-border bg-popover px-3 py-2 text-caption text-popover-foreground shadow-popover">{label}</Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}

export function WorkspaceNavigation({ collapsed = false, onNavigate }: {
  collapsed?: boolean; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return <nav aria-label="Workspace navigation" className={`
      workspace-navigation [&&]:flex [&&]:flex-col [&&]:gap-[16px] [&&_ul]:grid [&&_ul]:gap-[4px]
      [[data-collapsed='true']_&&]:gap-[24px] [[data-collapsed='true']_&&_ul]:gap-[8px]
      max-1023:[.workspace-drawer_&&]:gap-[16px]
    `}>
    {groups.map(group => <div key={group.label}>
      <p className={cn(`
      workspace-nav-label text-muted-foreground [&&]:mt-[0] [&&]:mr-[12px] [&&]:mb-[4px] [&&]:ml-[12px]
      [&&]:text-[length:11px] [&&]:leading-[16px] [&&]:font-[500] [&&]:uppercase [&&]:tracking-[.02em]
    `, collapsed && "sr-only")}>{group.label}</p>
      <ul>{group.items.map(item => {
        const Icon = item.icon;
        // Credits is a shortcut into Settings, so Settings owns its active state.
        const active = item.label === "Credits" ? false
          : item.label === "Studio" ? pathname === "/studio" || pathname.startsWith("/projects/")
          : item.label === "Marketplace" ? pathname.startsWith("/marketplace")
          : item.label === "Settings" ? pathname === "/settings" || pathname.startsWith("/settings/")
          : item.label === "Documentation" ? pathname === "/documentation" || pathname.startsWith("/documentation/")
          : item.label === "Templates" ? pathname === "/templates" || pathname.startsWith("/templates/")
          : item.href === pathname;
        const classes = cn(`
      workspace-nav-item flex w-full items-center rounded-lg text-body-sm font-medium outline-none transition-colors
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none
      hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&&]:min-h-[32px] [&&]:gap-[8px] [&&]:pt-[5px]
      [&&]:pr-[8px] [&&]:pb-[5px] [&&]:pl-[8px] [&&]:rounded-[10px] [&&]:leading-[22px] [[data-collapsed='true']_&&]:w-[36px]
      [[data-collapsed='true']_&&]:h-[36px] [[data-collapsed='true']_&&]:pt-[0] [[data-collapsed='true']_&&]:pr-[0]
      [[data-collapsed='true']_&&]:pb-[0] [[data-collapsed='true']_&&]:pl-[0] [[data-collapsed='true']_&&]:ml-[auto]
      [[data-collapsed='true']_&&]:mr-[auto] max-1023:[&&]:min-h-[40px]
    `, collapsed && "justify-center", active && "bg-sidebar-accent text-sidebar-accent-foreground");
        const content = <><Icon className="size-4 shrink-0" aria-hidden="true" /><span className={collapsed ? "sr-only" : "truncate"}>{item.label}</span></>;
        return <li key={item.label}><WorkspaceTooltip label={item.label} enabled={collapsed}>
          <Link href={item.href} aria-label={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} onClick={onNavigate} className={classes}>{content}</Link>
        </WorkspaceTooltip></li>;
      })}</ul>
    </div>)}
  </nav>;
}
