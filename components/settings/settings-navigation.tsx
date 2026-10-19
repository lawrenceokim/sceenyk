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
  return <aside className="workspace-doc-topics workspace-settings-navigation" aria-label="Settings navigation"><div className="workspace-doc-picker workspace-settings-picker"><label htmlFor="settings-section" className="sr-only">Settings section</label><select id="settings-section" disabled={!ready} value={`/settings/${selected}`} onChange={event => router.push(event.target.value, { scroll: false })} className="sceenyk-field">{settingsSections.map(([section, label]) => <option key={section} value={`/settings/${section}`}>{label}</option>)}</select></div><nav aria-label="Settings sections" className="workspace-doc-topic-list workspace-settings-nav-list" tabIndex={0}>
    <div><p>Settings</p>
    <ul>{settingsSections.map(([section, label]) => {
      const href = `/settings/${section}`;
      const active = section === selected;
      return <li key={section}><Link href={href} scroll={false} aria-current={active ? "page" : undefined}
        className={cn("outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none", active ? "bg-accent text-accent-foreground" : "text-foreground")}>{label}</Link></li>;
    })}</ul></div>
  </nav></aside>;
}
