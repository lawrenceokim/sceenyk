"use client";

import Link from "next/link";
import { Select } from "@/components/ui/select";
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
        <Select id="documentation-topic" value={documentationHref(activeSlug)} disabled={!ready} onValueChange={value => router.push(value, { scroll: false })} options={documentationTopics.map(topic => ({ value: documentationHref(topic.slug), label: topic.label, group: topic.group }))} className="h-9" />
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
