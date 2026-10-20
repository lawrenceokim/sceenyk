"use client";

import Link from "next/link";
import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { popupMotion } from "@/components/ui/motion";
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
  return <aside className={"workspace-doc-topics workspace-settings-navigation [&&]:min-w-[0] [&&]:min-h-[0] @min-[760px]/documentation:[&&]:overflow-hidden min-[1024px]:[&&]:overflow-hidden"} aria-label="Settings navigation"><div className={"workspace-doc-picker workspace-settings-picker @min-[760px]/documentation:[&&]:hidden min-[1024px]:[&&]:hidden"}><label htmlFor="settings-section" className="sr-only">Settings section</label><Select.Root value={`/settings/${selected}`} disabled={!ready} items={settingsSections.map(([value, label]) => ({ value: `/settings/${value}`, label }))} onValueChange={value => { if (value) router.push(value, { scroll: false }); }}><Select.Trigger id="settings-section" className={`flex items-center justify-between gap-2 text-left
      [@layer_components]:w-[100%] [@layer_components]:min-h-[var(--control-height)]
      [@layer_components]:[border:1px_solid_var(--input)] [@layer_components]:rounded-[var(--radius-md)]
      [@layer_components]:pt-[var(--space-3)] [@layer_components]:pr-[var(--space-4)] [@layer_components]:pb-[var(--space-3)]
      [@layer_components]:pl-[var(--space-4)] [@layer_components]:[background:var(--field)]
      [@layer_components]:text-[color:var(--foreground)]
      [@layer_components]:[transition:border-color_var(--duration-fast),_box-shadow_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] sceenyk-field
      [@layer_components]:[&::placeholder]:text-[color:var(--muted-foreground)]
      [@layer_components]:[&::placeholder]:opacity-[1] [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:2px]
      [@layer_components]:[&:focus-visible]:[border-color:var(--ring)]
      [@layer_components]:[&:focus-visible]:[box-shadow:var(--focus-shadow)]
      [@layer_components]:[&[aria-invalid='true']]:[border-color:var(--destructive)]
      [@layer_components]:[&[aria-invalid='true']:focus-visible]:[outline-color:var(--destructive)]
      [@layer_components]:[&[aria-invalid='true']:focus-visible]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--destructive)_24%,_transparent)]
      [@layer_components]:[&:disabled]:opacity-[0.5] [@layer_components]:[&:disabled]:cursor-not-allowed
      [.workspace-marketplace-search_&&]:min-h-[32px] [.workspace-marketplace-search_&&]:h-[32px]
      [.workspace-marketplace-search_&&]:pt-[4px] [.workspace-marketplace-search_&&]:pb-[4px]
      [.workspace-marketplace-search_&&]:text-[length:12px] [.workspace-marketplace-search_&&]:rounded-[16px]
      [.workspace-doc-picker_&&]:w-[100%] [.workspace-doc-picker_&&]:h-[36px] [.workspace-doc-picker_&&]:min-h-[36px]
      [.workspace-doc-picker_&&]:pt-[6px] [.workspace-doc-picker_&&]:pb-[6px]
      [.workspace-doc-picker_&&]:rounded-[var(--ui-radius-control)] [.workspace-doc-picker_&&]:text-[length:13px]
      [@media_(pointer:_coarse)]:[.workspace-doc-picker_&&]:h-[44px]
      [@media_(pointer:_coarse)]:[.workspace-doc-picker_&&]:min-h-[44px] [.workspace-project-rename_&&]:h-[36px]
      [.workspace-project-rename_&&]:min-h-[36px] [.workspace-project-rename_&&]:pt-[6px]
      [.workspace-project-rename_&&]:pr-[8px] [.workspace-project-rename_&&]:pb-[6px] [.workspace-project-rename_&&]:pl-[8px]
      [.workspace-project-rename_&&]:rounded-[7px] [.workspace-project-rename_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-project-rename_&&]:min-h-[44px] [.workspace-settings-inner_textarea&&]:h-[auto]
      [.workspace-settings-inner_textarea&&]:min-h-[96px] [.workspace-settings-inner_textarea&&]:pt-[8px]
      [.workspace-settings-inner_textarea&&]:pr-[8px] [.workspace-settings-inner_textarea&&]:pb-[8px]
      [.workspace-settings-inner_textarea&&]:pl-[8px] [.workspace-settings-inner_textarea&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-picker_&&]:min-h-[44px]
      [.studio-property_&&]:min-h-[var(--workspace-control-height)] [.studio-property_&&]:rounded-[var(--ui-radius-control)]
      [.studio-property_&&]:pt-[6px] [.studio-property_&&]:pr-[8px] [.studio-property_&&]:pb-[6px]
      [.studio-property_&&]:pl-[8px] [.studio-property_&&]:text-[length:var(--ui-text-control)]
      [.studio-property_&&]:leading-[18px] [.studio-property_textarea&&]:min-h-[112px]
      [.studio-property_textarea&&]:pt-[var(--ui-space-3)] [.studio-property_textarea&&]:pr-[var(--ui-space-3)]
      [.studio-property_textarea&&]:pb-[var(--ui-space-3)] [.studio-property_textarea&&]:pl-[var(--ui-space-3)]
      [.studio-property_textarea&&]:text-[length:13px] [.studio-property_textarea&&]:leading-[20px]
      [.studio-setting-select_select&&]:pr-[28px]
    `}><Select.Value /><Select.Icon><ChevronDown className="size-4" aria-hidden="true" /></Select.Icon></Select.Trigger>
      <Select.Portal><Select.Positioner alignItemWithTrigger={false} align="start" sideOffset={6} collisionPadding={8} className="z-[70]">
        <Select.Popup data-lenis-prevent className={cn(popupMotion, "max-h-[var(--available-height)] min-w-[var(--anchor-width)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-popover")}>
          <Select.List className="max-h-[min(24rem,var(--available-height))] overflow-y-auto overscroll-contain">
            {settingsSections.map(([value, label]) => <Select.Item key={value} value={`/settings/${value}`} className="flex min-h-11 cursor-default items-center justify-between gap-3 rounded-md px-3 text-body-sm outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] data-highlighted:bg-accent data-highlighted:text-accent-foreground"><Select.ItemText>{label}</Select.ItemText><Select.ItemIndicator><Check className="size-4" aria-hidden="true" /></Select.ItemIndicator></Select.Item>)}
          </Select.List>
        </Select.Popup>
      </Select.Positioner></Select.Portal>
    </Select.Root></div><nav aria-label="Settings sections" className={`
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
