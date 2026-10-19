"use client";

import Link from "next/link";
import { useAuth, useClerk, useUser, UserAvatar } from "@clerk/nextjs";
import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { cn } from "@/lib/utils";

const accountLinks = [
  ["Account", "account"], ["Creator Profile", "creator-profile"],
  ["Credits & Billing", "credits"], ["Earnings & Payouts", "earnings"],
  ["Settings", "account"],
] as const;

function GuestAccount({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return <Link href="/?auth=sign-in" onClick={onNavigate} title={collapsed ? "Sign in" : undefined} className="flex min-h-10 items-center justify-center gap-2 rounded-lg px-2 text-body-sm font-medium hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"><UserRound className="size-4" aria-hidden="true" /><span className={collapsed ? "sr-only" : undefined}>Sign in</span></Link>;
}

function ConfiguredUserMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded) return <div className="h-12 rounded-xl bg-muted" role="status" aria-label="Loading account" />;
  if (!isSignedIn || !user) return <GuestAccount collapsed={collapsed} onNavigate={onNavigate} />;
  return <Menu.Root>
    <Menu.Trigger aria-label="Open account menu" title={collapsed ? "Your account" : undefined} className={cn("flex min-h-14 w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring", collapsed && "justify-center")}>
      <span className="shrink-0"><UserAvatar /></span>
      {!collapsed && <><span className="min-w-0 flex-1"><span className="block truncate text-body-sm font-medium">{user.fullName || user.username || "Your account"}</span><span className="block truncate text-caption text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</span></span><ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></>}
    </Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} className="z-[70]">
      <Menu.Popup aria-label="Account actions" className="w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-popover outline-none">
        {accountLinks.map(([label, section]) => <Menu.Item key={label} render={<Link href={`/settings/${section}`} />} onClick={onNavigate} className="flex min-h-11 items-center rounded-lg px-3 text-body-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">{label}</Menu.Item>)}
        <Menu.Separator className="my-1 border-t border-border" />
        <Menu.Item onClick={() => { onNavigate?.(); void signOut({ redirectUrl: "/" }); }} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-body-sm outline-none data-highlighted:bg-accent"><LogOut className="size-4" aria-hidden="true" />Sign out</Menu.Item>
      </Menu.Popup>
    </Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}

export function WorkspaceUserMenu({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const available = useAuthAvailable();
  return <div className={"workspace-account shrink-0 p-2 [[data-workspace-shell]_&&_[aria-label='Open_account_menu']]:pt-[4px] [[data-workspace-shell]_&&_[aria-label='Open_account_menu']]:pb-[4px]"}>{available ? <ConfiguredUserMenu collapsed={collapsed} onNavigate={onNavigate} /> : <GuestAccount collapsed={collapsed} onNavigate={onNavigate} />}</div>;
}
