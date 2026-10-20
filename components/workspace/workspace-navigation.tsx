"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Clapperboard, Coins, FolderOpen, LayoutTemplate, Settings2, Store } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { useId, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import { popupMotion } from "@/components/ui/motion";

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
  return <Tooltip.Root disabled={!enabled}><Tooltip.Trigger render={children} aria-describedby={enabled ? id : undefined} />
    <Tooltip.Portal><Tooltip.Positioner side="right" sideOffset={12} className="z-[70]">
      <Tooltip.Popup id={id} role="tooltip" className={cn(popupMotion, "rounded-lg border border-border bg-popover px-3 py-2 text-caption text-popover-foreground shadow-popover")}>{label}</Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}

export function WorkspaceNavigation({ collapsed = false, onNavigate }: {
  collapsed?: boolean; onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return <nav aria-label="Workspace navigation" className={`
      workspace-navigation [&&]:flex [&&]:flex-col [&&]:gap-[16px] [&&_ul]:grid [&&_ul]:gap-[4px]
      max-1023:[.workspace-drawer_&&]:gap-[16px]
    `}>
    {groups.map(group => <div key={group.label}>
      <p className={cn(`
      workspace-nav-label whitespace-nowrap text-muted-foreground [&&]:mt-[0] [&&]:mr-[12px] [&&]:mb-[4px] [&&]:ml-[12px]
      [&&]:text-[length:11px] [&&]:leading-[16px] [&&]:font-[500] [&&]:uppercase [&&]:tracking-[.02em]
      transition-[opacity,translate] duration-[var(--motion-panel)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:translate-none
    `, collapsed && "opacity-0 -translate-x-1")} aria-hidden={collapsed}>{group.label}</p>
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
      workspace-nav-item flex w-full items-center overflow-hidden rounded-lg text-body-sm font-medium outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)]
      focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring motion-reduce:transition-none
      hover:bg-sidebar-accent hover:text-sidebar-accent-foreground [&&]:min-h-[32px] [&&]:gap-[8px] [&&]:pt-[5px]
      [&&]:pr-[8px] [&&]:pb-[5px] [&&]:pl-[8px] [&&]:rounded-[10px] [&&]:leading-[22px] max-1023:[&&]:min-h-[40px]
    `, active && "bg-sidebar-accent text-sidebar-accent-foreground");
        const content = <><Icon className="size-4 shrink-0" aria-hidden="true" /><span aria-hidden={collapsed} className={cn("truncate transition-[opacity,translate] duration-[var(--motion-panel)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:translate-none", collapsed && "opacity-0 -translate-x-1")}>{item.label}</span></>;
        return <li key={item.label}><WorkspaceTooltip label={item.label} enabled={collapsed}>
          <Link href={item.href} aria-label={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} onClick={onNavigate} className={classes}>{content}</Link>
        </WorkspaceTooltip></li>;
      })}</ul>
    </div>)}
  </nav>;
}
