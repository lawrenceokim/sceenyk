"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

export const settingsSections = [
  ["account", "Account"],
  ["creator-profile", "Creator Profile"],
  ["credits", "Credits & Billing"],
  ["earnings", "Earnings & Payouts"],
  ["creation", "Creation Preferences"],
  ["notifications", "Notifications"],
  ["appearance", "Appearance"],
  ["privacy", "Privacy & Security"],
  ["data", "Data & Account"],
] as const;
const subscribeReadiness = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function SettingsNavigation() {
  const pathname = usePathname();
  const router = useRouter();
  // The section picker needs the router handler before it can navigate.
  const ready = useSyncExternalStore(subscribeReadiness, clientReady, serverReady);
  return <><div className="space-y-2 xl:hidden"><label htmlFor="settings-section" className="text-body-sm font-medium">Settings section</label><select id="settings-section" disabled={!ready} value={pathname} onChange={event => router.push(event.target.value)} className="min-h-11 w-full rounded-lg border border-input bg-field px-3 text-body-sm">{settingsSections.map(([section, label]) => <option key={section} value={`/dashboard/settings/${section}`}>{label}</option>)}</select></div><nav aria-label="Settings sections" className="hidden gap-1 xl:sticky xl:top-28 xl:grid xl:grid-cols-1">
    {settingsSections.map(([section, label]) => {
      const href = `/dashboard/settings/${section}`;
      const active = pathname === href;
      return <Link key={section} href={href} aria-current={active ? "page" : undefined}
        className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-body-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none", active ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>{label}</Link>;
    })}
  </nav></>;
}
