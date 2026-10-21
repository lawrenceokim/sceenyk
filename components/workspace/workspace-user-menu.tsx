"use client";

import Link from "next/link";
import { useAuth, useClerk, useUser, UserAvatar } from "@clerk/nextjs";
import { Menu } from "@base-ui/react/menu";
import { ChevronsUpDown, LogOut, UserRound } from "lucide-react";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { cn } from "@/lib/utils";
import { popupMotion } from "@/components/ui/motion";
import { Skeleton } from "@/components/ui/skeleton";

const accountLinks = [
  ["Account", "/settings/account"], ["Creator Profile", "/settings/creator-profile"],
  ["Credits & Billing", "/credits"], ["Earnings & Payouts", "/credits/earnings"],
  ["Settings", "/settings/account"],
] as const;

function GuestAccount({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return <Link href="/?auth=sign-in" onClick={onNavigate} aria-label="Sign in" title={collapsed ? "Sign in" : undefined} className="flex min-h-10 items-center gap-2 overflow-hidden rounded-lg px-2 text-body-sm font-medium transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-ring"><UserRound className="size-4 shrink-0" aria-hidden="true" /><span aria-hidden={collapsed} className={cn("whitespace-nowrap transition-[opacity,translate] duration-[var(--motion-panel)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:translate-none", collapsed && "opacity-0 -translate-x-1")}>Sign in</span></Link>;
}

function ConfiguredUserMenu({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();
  if (!isLoaded) return <div className="flex min-h-14 items-center gap-3 overflow-hidden rounded-xl p-2" role="status" aria-label="Loading account"><Skeleton className="size-8 shrink-0 rounded-full" />{!collapsed && <div className="min-w-0 flex-1 space-y-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-full" /></div>}</div>;
  if (!isSignedIn || !user) return <GuestAccount collapsed={collapsed} onNavigate={onNavigate} />;
  return <Menu.Root>
    <Menu.Trigger aria-label="Open account menu" title={collapsed ? "Your account" : undefined} className={cn("flex min-h-14 w-full items-center gap-3 overflow-hidden rounded-xl p-2 text-left transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] hover:bg-sidebar-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sidebar-ring")}>
      <span className="shrink-0"><UserAvatar /></span>
      <span aria-hidden={collapsed} className={cn("min-w-0 flex-1 transition-[opacity,translate] duration-[var(--motion-panel)] ease-[var(--motion-ease)] motion-reduce:transition-none motion-reduce:translate-none", collapsed && "opacity-0 -translate-x-1")}><span className="block truncate text-body-sm font-medium">{user.fullName || user.username || "Your account"}</span><span className="block truncate text-caption text-muted-foreground">{user.primaryEmailAddress?.emailAddress}</span></span><ChevronsUpDown className={cn("size-4 shrink-0 text-muted-foreground transition-opacity duration-[var(--motion-panel)] motion-reduce:transition-none", collapsed && "opacity-0")} aria-hidden="true" />
    </Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="top" align="start" sideOffset={8} className="z-[70]">
      <Menu.Popup data-lenis-prevent aria-label="Account actions" className={cn(popupMotion, "w-60 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-popover outline-none")}>
        {accountLinks.map(([label, href]) => <Menu.Item key={label} render={<Link href={href} />} onClick={onNavigate} className="flex min-h-11 items-center rounded-lg px-3 text-body-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground">{label}</Menu.Item>)}
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
