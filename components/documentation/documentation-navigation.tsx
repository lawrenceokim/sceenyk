"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { documentationHref, documentationTopics } from "@/lib/documentation/content";
import { cn } from "@/lib/utils";

const subscribe = () => () => {};

export function DocumentationNavigation({ activeSlug }: { activeSlug: string }) {
  const router = useRouter();
  const ready = useSyncExternalStore(subscribe, () => true, () => false);
  const groups = [...new Set(documentationTopics.map(topic => topic.group))];
  return (
    <aside className={"workspace-doc-topics [&&]:min-w-[0] [&&]:min-h-[0] @min-[760px]/documentation:[&&]:overflow-hidden"} aria-label="Documentation topics">
      <div className={"workspace-doc-picker @min-[760px]/documentation:[&&]:hidden"}>
        <label htmlFor="documentation-topic" className="sr-only">Documentation topic</label>
        <select id="documentation-topic" value={documentationHref(activeSlug)} disabled={!ready} onChange={event => router.push(event.target.value, { scroll: false })} className={`
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
    `}>
          {groups.map(group => <optgroup key={group} label={group}>{documentationTopics.filter(topic => topic.group === group).map(topic => <option key={topic.slug} value={documentationHref(topic.slug)}>{topic.label}</option>)}</optgroup>)}
        </select>
      </div>
      <nav aria-label="Documentation topics" className={`
      workspace-doc-topic-list [&&]:hidden [&&:focus-visible]:[outline:2px_solid_var(--ring)]
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
      [@media_(pointer:_coarse)]:[&&_a]:min-h-[44px]
    `} tabIndex={0}>
        {groups.map(group => <div key={group}>
          <p>{group}</p>
          <ul>{documentationTopics.filter(topic => topic.group === group).map(topic => (
            <li key={topic.slug}><Link href={documentationHref(topic.slug)} scroll={false} aria-current={activeSlug === topic.slug ? "page" : undefined}
              className={cn("outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none", activeSlug === topic.slug ? "bg-accent text-accent-foreground" : "text-foreground")}>{topic.label}</Link></li>
          ))}</ul>
        </div>)}
      </nav>
    </aside>
  );
}
