"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { defaultThemePreference, readThemePreference, setThemePreference, themeChangeEvent } from "@/lib/theme";
import { cn } from "@/lib/utils";

function subscribe(callback: () => void) {
  window.addEventListener(themeChangeEvent, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(themeChangeEvent, callback); window.removeEventListener("storage", callback); };
}
const choices = [
  { value: "light", label: "Light", description: "A bright space for your ideas.", icon: Sun },
  { value: "dark", label: "Dark", description: "A quieter canvas after hours.", icon: Moon },
  { value: "system", label: "System", description: "Follow your device’s appearance.", icon: Monitor },
] as const;
const subscribeReadiness = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function AppearanceSettings() {
  // Static streamed markup is visible before its radio handlers hydrate.
  // Keep it inert until selecting a theme can update the shared preference.
  const ready = useSyncExternalStore(subscribeReadiness, clientReady, serverReady);
  const preference = useSyncExternalStore(subscribe, readThemePreference, () => defaultThemePreference);
  return <fieldset disabled={!ready} aria-busy={!ready} className="space-y-4"><legend className="mb-4 text-body-sm font-medium">Choose your appearance</legend><div className="grid gap-3 sm:grid-cols-3">{choices.map(({ value, label, description, icon: Icon }) => <label key={value} className={cn(`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card relative flex min-h-36 cursor-pointer flex-col
      gap-3 p-5 focus-within:ring-2 focus-within:ring-ring [.marketplace-configuration_>_&&]:[border:0]
      [.marketplace-configuration_>_&&]:rounded-[0] [.marketplace-configuration_>_&&]:[background:transparent]
      [.marketplace-configuration_>_&&]:pt-[16px] [.marketplace-configuration_>_&&]:pr-[0]
      [.marketplace-configuration_>_&&]:pb-[0] [.marketplace-configuration_>_&&]:pl-[0]
      [[data-workspace-shell]_&&]:[box-shadow:none] [.workspace-settings-inner_label&&]:min-h-[0]
      [.workspace-settings-inner_label&&]:gap-[8px] [.workspace-settings-inner_label&&]:pt-[12px]
      [.workspace-settings-inner_label&&]:pr-[12px] [.workspace-settings-inner_label&&]:pb-[12px]
      [.workspace-settings-inner_label&&]:pl-[12px] [.workspace-settings-inner_label&&_svg]:w-[18px]
      [.workspace-settings-inner_label&&_svg]:h-[18px]
    `, preference === value && "border-primary bg-accent/30")}><div className="flex items-center justify-between gap-3"><Icon className="size-6 text-link" aria-hidden="true" /><input type="radio" name="appearance" value={value} checked={preference === value} onChange={() => setThemePreference(value)} className="size-5 accent-primary" /></div><span className="font-semibold">{label}</span><span className="text-caption text-muted-foreground">{description}</span></label>)}</div><p className="text-body-sm text-muted-foreground">{ready ? "Changes apply immediately. Your choice is saved in this browser when storage is available." : "Loading your appearance preference…"}</p></fieldset>;
}
