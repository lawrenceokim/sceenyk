"use client";

import Link from "next/link";
import { Select } from "@/components/ui/select";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export const settingsSections = [
  ["account", "Account"],
  ["creator-profile", "Creator Profile"],
  ["creation", "Creation Preferences"],
  ["notifications", "Notifications"],
  ["appearance", "Appearance"],
  ["privacy", "Privacy & Security"],
  ["data", "Data & Account"],
  ["templates", "Manage Templates"],
] as const;
const subscribeReadiness = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function SettingsNavigation() {
  const pathname = usePathname();
  const selected = settingsSections.find(([section]) => pathname === `/settings/${section}` || pathname.startsWith(`/settings/${section}/`))?.[0] ?? "account";
  const router = useRouter();
  // The section picker needs the router handler before it can navigate.
  const ready = useSyncExternalStore(subscribeReadiness, clientReady, serverReady);
  return <aside className={"workspace-doc-topics workspace-settings-navigation [&&]:min-w-[0] [&&]:min-h-[0] @min-[760px]/documentation:[&&]:overflow-hidden min-[1024px]:[&&]:overflow-hidden"} aria-label="Settings navigation"><div className={"workspace-doc-picker workspace-settings-picker @min-[760px]/documentation:[&&]:hidden min-[1024px]:[&&]:hidden"}><label htmlFor="settings-section" className="sr-only">Settings section</label><Select id="settings-section" value={`/settings/${selected}`} disabled={!ready} options={settingsSections.map(([value, label]) => ({ value: `/settings/${value}`, label }))} onValueChange={value => router.push(value, { scroll: false })} className="h-9" /></div><nav aria-label="Settings sections" className={`
      workspace-doc-topic-list workspace-settings-nav-list [&&]:hidden [&&:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&:focus-visible]:[outline-offset:-2px] @min-[760px]/documentation:[&&]:block @min-[760px]/documentation:[&&]:h-[100%]
      @min-[760px]/documentation:[&&]:overflow-y-auto @min-[760px]/documentation:[&&]:overscroll-contain
      @min-[760px]/documentation:[&&]:pt-[1px] @min-[760px]/documentation:[&&]:pr-[0]
      @min-[760px]/documentation:[&&]:pb-[24px] @min-[760px]/documentation:[&&]:pl-[0]
      @min-[760px]/documentation:[&&_>_div_+_div]:mt-[22px] @min-[760px]/documentation:[&&_p]:mt-[0]
      @min-[760px]/documentation:[&&_p]:mr-[10px] @min-[760px]/documentation:[&&_p]:mb-[6px]
      @min-[760px]/documentation:[&&_p]:ml-[10px] @min-[760px]/documentation:[&&_p]:text-[length:10px]
      @min-[760px]/documentation:[&&_p]:leading-[16px] @min-[760px]/documentation:[&&_p]:font-[500]
      @min-[760px]/documentation:[&&_p]:uppercase @min-[760px]/documentation:[&&_p]:text-[color:var(--muted-foreground)]
      @min-[760px]/documentation:[&&_a]:flex @min-[760px]/documentation:[&&_a]:items-center
      @min-[760px]/documentation:[&&_a]:min-h-[28px] @min-[760px]/documentation:[&&_a]:pt-[4px]
      @min-[760px]/documentation:[&&_a]:pr-[10px] @min-[760px]/documentation:[&&_a]:pb-[4px]
      @min-[760px]/documentation:[&&_a]:pl-[10px] @min-[760px]/documentation:[&&_a]:rounded-[7px]
      @min-[760px]/documentation:[&&_a]:text-[length:12px] @min-[760px]/documentation:[&&_a]:leading-[20px]
      @min-[760px]/documentation:[&&_a]:font-[500] @min-[760px]/documentation:[&&_li_+_li]:mt-[2px]
      [@media_(pointer:_coarse)]:[&&_a]:min-h-[44px] min-[1024px]:[&&]:block min-[1024px]:[&&]:h-[100%]
      min-[1024px]:[&&]:overflow-y-auto min-[1024px]:[&&]:overscroll-contain min-[1024px]:[&&]:pt-[1px]
      min-[1024px]:[&&]:pr-[0] min-[1024px]:[&&]:pb-[24px] min-[1024px]:[&&]:pl-[0] min-[1024px]:[&&_p]:mt-[0]
      min-[1024px]:[&&_p]:mr-[10px] min-[1024px]:[&&_p]:mb-[6px] min-[1024px]:[&&_p]:ml-[10px]
      min-[1024px]:[&&_p]:text-[length:10px] min-[1024px]:[&&_p]:leading-[16px] min-[1024px]:[&&_p]:font-[500]
      min-[1024px]:[&&_p]:uppercase min-[1024px]:[&&_p]:text-[color:var(--muted-foreground)] min-[1024px]:[&&_a]:flex
      min-[1024px]:[&&_a]:items-center min-[1024px]:[&&_a]:min-h-[28px] min-[1024px]:[&&_a]:pt-[4px]
      min-[1024px]:[&&_a]:pr-[10px] min-[1024px]:[&&_a]:pb-[4px] min-[1024px]:[&&_a]:pl-[10px]
      min-[1024px]:[&&_a]:rounded-[7px] min-[1024px]:[&&_a]:text-[length:12px] min-[1024px]:[&&_a]:leading-[20px]
      min-[1024px]:[&&_a]:font-[500] min-[1024px]:[&&_li_+_li]:mt-[2px]
    `} tabIndex={0}>
    <div><p>Settings</p>
    <ul>{settingsSections.map(([section, label]) => {
      const href = `/settings/${section}`;
      const active = section === selected;
      return <li key={section}><Link href={href} scroll={false} aria-current={active ? "page" : undefined}
        className={cn("outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none", active ? "bg-accent text-accent-foreground" : "text-foreground")}>{label}</Link></li>;
    })}</ul></div>
  </nav></aside>;
}
