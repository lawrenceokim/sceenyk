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
    <aside className="workspace-doc-topics" aria-label="Documentation topics">
      <div className="workspace-doc-picker">
        <label htmlFor="documentation-topic" className="sr-only">Documentation topic</label>
        <select id="documentation-topic" value={documentationHref(activeSlug)} disabled={!ready} onChange={event => router.push(event.target.value, { scroll: false })} className="sceenyk-field">
          {groups.map(group => <optgroup key={group} label={group}>{documentationTopics.filter(topic => topic.group === group).map(topic => <option key={topic.slug} value={documentationHref(topic.slug)}>{topic.label}</option>)}</optgroup>)}
        </select>
      </div>
      <nav aria-label="Documentation topics" className="workspace-doc-topic-list" tabIndex={0}>
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
