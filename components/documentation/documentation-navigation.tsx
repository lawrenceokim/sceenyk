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
    <aside className="workspace-doc-topics min-w-0 xl:sticky xl:top-8" aria-label="Documentation topics">
      <div className="space-y-2 xl:hidden">
        <label htmlFor="documentation-topic" className="text-body-sm font-medium">Documentation topic</label>
        <select id="documentation-topic" value={documentationHref(activeSlug)} disabled={!ready} onChange={event => router.push(event.target.value)} className="sceenyk-field">
          {documentationTopics.map(topic => <option key={topic.slug} value={documentationHref(topic.slug)}>{topic.label}</option>)}
        </select>
      </div>
      <nav aria-label="Documentation topics" className="hidden max-h-[calc(100dvh-4rem)] space-y-6 overflow-y-auto xl:block">
        {groups.map(group => <div key={group}>
          <p className="mb-2 px-3 text-caption font-medium uppercase tracking-wide text-muted-foreground">{group}</p>
          <ul className="space-y-1">{documentationTopics.filter(topic => topic.group === group).map(topic => (
            <li key={topic.slug}><Link href={documentationHref(topic.slug)} aria-current={activeSlug === topic.slug ? "page" : undefined}
              className={cn("flex min-h-11 items-center rounded-lg px-3 py-2 text-body-sm font-medium outline-none transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none", activeSlug === topic.slug ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>{topic.label}</Link></li>
          ))}</ul>
        </div>)}
      </nav>
    </aside>
  );
}
