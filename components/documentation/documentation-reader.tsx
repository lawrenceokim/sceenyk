"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { DocumentationTopic } from "@/lib/documentation/content";

export function DocumentationReader({ topic, children }: { topic: DocumentationTopic; children: ReactNode }) {
  const articleRef = useRef<HTMLElement>(null);
  const initialized = useRef(false);
  const [activeSection, setActiveSection] = useState(topic.sections[0]?.id);
  const showContents = topic.sections.length > 1;

  useLayoutEffect(() => {
    const article = articleRef.current;
    if (!article) return;
    const headings = Array.from(article.querySelectorAll<HTMLElement>("section > [id]"));
    let frame = 0;
    const updateActive = () => {
      const top = article.getBoundingClientRect().top;
      let current = headings[0]?.id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= top + 40) current = heading.id;
      }
      if (article.scrollHeight > article.clientHeight && article.scrollTop + article.clientHeight >= article.scrollHeight - 2) {
        current = headings.at(-1)?.id ?? current;
      }
      setActiveSection(current);
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateActive);
    };
    const readHash = () => {
      const heading = headings.find(item => `#${item.id}` === window.location.hash);
      if (heading) {
        article.scrollTo({ top: heading.getBoundingClientRect().top - article.getBoundingClientRect().top + article.scrollTop - 8, behavior: "instant" });
        heading.focus({ preventScroll: true });
      }
      updateActive();
    };
    // Activity reactivation retains the existing scroll position; a new topic
    // mounts its own reader and starts at the top unless explicitly deep-linked.
    if (!initialized.current) {
      article.scrollTop = 0;
      initialized.current = true;
      readHash();
    }
    updateActive();
    article.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("hashchange", readHash);
    window.addEventListener("popstate", readHash);
    const resize = new ResizeObserver(onScroll);
    resize.observe(article);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      article.removeEventListener("scroll", onScroll);
      window.removeEventListener("hashchange", readHash);
      window.removeEventListener("popstate", readHash);
    };
  }, [topic.slug]);

  function navigateSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const article = articleRef.current;
    const heading = article?.querySelector<HTMLElement>(`#${id}`);
    if (!article || !heading) return;
    event.preventDefault();
    if (window.location.hash !== `#${id}`) window.history.pushState(null, "", `#${id}`);
    heading.focus({ preventScroll: true });
    article.scrollTo({
      top: heading.getBoundingClientRect().top - article.getBoundingClientRect().top + article.scrollTop - 8,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
  }

  return <div className={`
      workspace-doc-reader [&&]:grid [&&]:[grid-template-columns:minmax(0,_1fr)]
      [&&]:[grid-template-rows:auto_minmax(0,_1fr)] [&&]:min-w-[0] [&&]:min-h-[0] [&&]:overflow-hidden
      [&&_a:focus-visible]:rounded-[4px] [&&_a:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_a:focus-visible]:[outline-offset:-2px]
      @min-[1050px]/documentation:[&&[data-has-contents='true']]:[grid-template-columns:minmax(0,_1fr)_198px]
      @min-[1050px]/documentation:[&&[data-has-contents='true']]:gap-x-[48px]
    `} data-has-contents={showContents}>
    <header className={`
      workspace-doc-header [&&]:[grid-column:1_/_-1] [&&]:relative [&&]:z-[1] [&&]:pb-[20px] [&&]:[background:var(--card)]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:mt-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:mr-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:mb-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:ml-[0]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:text-[length:28px]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:leading-[38px]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:font-[650]
      [.workspace-page[data-workspace-view='documentation']_&&_h1]:tracking-[-.035em] [&&_p]:mt-[10px]
      [&&_p]:text-[color:var(--muted-foreground)] [&&_p]:text-[length:14px] [&&_p]:leading-[22px]
      [&&_p]:[overflow-wrap:anywhere]
      @min-[760px]/documentation:[.workspace-page[data-workspace-view='documentation']_&&_h1]:text-[length:32px]
      @min-[1050px]/documentation:[&&_p]:max-w-[720px]
    `}>
      <h1>Documentation</h1>
      <p>{topic.description}</p>
    </header>
    <article ref={articleRef} aria-label={topic.label} tabIndex={0} className={`
      workspace-doc-article [&&]:min-w-[0] [&&]:min-h-[0] [&&]:overflow-y-auto [&&]:overscroll-contain
      [&&]:[scroll-padding-top:8px] [&&]:pt-[2px] [&&]:pr-[2px] [&&]:pb-[36px] [&&]:pl-[2px] [&&]:[overflow-wrap:anywhere]
      [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:14px] [&&]:leading-[23px]
      [&&:focus-visible]:[outline:2px_solid_var(--ring)] [&&:focus-visible]:[outline-offset:-2px] [&&_>_*_+_*]:mt-[28px]
      [&&_section_>_*_+_*]:mt-[16px] [&&_:is(h2,_h3)]:text-[color:var(--foreground)] [&&_:is(h2,_h3)]:text-[length:13px]
      [&&_:is(h2,_h3)]:leading-[20px] [&&_:is(h2,_h3)]:font-[600] [&&_:is(h2,_h3)]:tracking-[-.01em]
      [&&_:is(h2,_h3)]:[scroll-margin-top:8px] [&&_>_section:first-child_>_h2]:text-[length:20px]
      [&&_>_section:first-child_>_h2]:leading-[28px] [&&_>_section:first-child_>_h2]:tracking-[-.025em]
      [&&_[id]:focus-visible]:rounded-[4px] [&&_[id]:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_[id]:focus-visible]:[outline-offset:-2px] [&&_:is(ul,_ol)]:pl-[18px] [&&_li_+_li]:mt-[6px]
      [&&_strong]:text-[color:var(--foreground)] [&&_strong]:font-[600] [&&_table]:block [&&_table]:max-w-[100%]
      [&&_table]:overflow-x-auto [&&_table]:[border-collapse:collapse] [&&_table]:text-[length:13px]
      [&&_table]:leading-[19px] [&&_:is(th,_td)]:pt-[7px] [&&_:is(th,_td)]:pr-[10px] [&&_:is(th,_td)]:pb-[7px]
      [&&_:is(th,_td)]:pl-[10px] [&&_:is(th,_td)]:[border:1px_solid_var(--border)] [&&_:is(th,_td)]:text-left
      [&&_th]:text-[color:var(--foreground)] [&&_th]:font-[600] [&&_pre]:max-w-[100%] [&&_pre]:overflow-x-auto
      [&&_pre]:pt-[12px] [&&_pre]:pr-[12px] [&&_pre]:pb-[12px] [&&_pre]:pl-[12px] [&&_pre]:[border:1px_solid_var(--border)]
      [&&_pre]:rounded-[8px] [&&_pre]:[background:var(--background)] [&&_pre]:text-[length:12px] [&&_blockquote]:ml-[0]
      [&&_blockquote]:mr-[0] [&&_blockquote]:pt-[10px] [&&_blockquote]:pr-[12px] [&&_blockquote]:pb-[10px]
      [&&_blockquote]:pl-[12px] [&&_blockquote]:[border:1px_solid_var(--border)] [&&_blockquote]:rounded-[8px]
      [&&_blockquote]:[background:var(--background)] [&&_blockquote]:text-[length:13px] [&&_blockquote]:leading-[21px]
    `}>
      {children}
    </article>
    {showContents && <nav aria-label="On this page" className={`
      workspace-doc-contents [&&]:hidden @min-[1050px]/documentation:[&&]:block
      @min-[1050px]/documentation:[&&]:[grid-column:2] @min-[1050px]/documentation:[&&]:[grid-row:2]
      @min-[1050px]/documentation:[&&]:min-h-[0] @min-[1050px]/documentation:[&&]:overflow-y-auto
      @min-[1050px]/documentation:[&&]:overscroll-contain @min-[1050px]/documentation:[&&]:pt-[12px]
      @min-[1050px]/documentation:[&&]:pr-[0] @min-[1050px]/documentation:[&&]:pb-[24px]
      @min-[1050px]/documentation:[&&]:pl-[0] @min-[1050px]/documentation:[&&_>_p]:pl-[10px]
      @min-[1050px]/documentation:[&&_>_p]:pr-[10px] @min-[1050px]/documentation:[&&_>_p]:mb-[4px]
      @min-[1050px]/documentation:[&&_>_p]:text-[length:10px] @min-[1050px]/documentation:[&&_>_p]:leading-[16px]
      @min-[1050px]/documentation:[&&_>_p]:font-[600] @min-[1050px]/documentation:[&&_>_p]:uppercase
      @min-[1050px]/documentation:[&&_>_p]:text-[color:var(--muted-foreground)] @min-[1050px]/documentation:[&&_a]:flex
      @min-[1050px]/documentation:[&&_a]:items-center @min-[1050px]/documentation:[&&_a]:min-h-[28px]
      @min-[1050px]/documentation:[&&_a]:pt-[4px] @min-[1050px]/documentation:[&&_a]:pr-[10px]
      @min-[1050px]/documentation:[&&_a]:pb-[4px] @min-[1050px]/documentation:[&&_a]:pl-[10px]
      @min-[1050px]/documentation:[&&_a]:rounded-[7px]
      @min-[1050px]/documentation:[&&_a]:text-[color:var(--muted-foreground)]
      @min-[1050px]/documentation:[&&_a]:text-[length:12px] @min-[1050px]/documentation:[&&_a]:leading-[20px]
      @min-[1050px]/documentation:[&&_a:hover]:[background:var(--muted)]
      @min-[1050px]/documentation:[&&_a:hover]:text-[color:var(--foreground)]
      @min-[1050px]/documentation:[&&_a[aria-current='location']]:[background:var(--muted)]
      @min-[1050px]/documentation:[&&_a[aria-current='location']]:text-[color:var(--foreground)]
      @min-[1050px]/documentation:[&&_a[aria-current='location']]:font-[600] [@media_(pointer:_coarse)]:[&&_a]:min-h-[44px]
    `}>
      <p>On this page</p>
      <ul>{topic.sections.map(section => <li key={section.id}>
        <a href={`#${section.id}`} aria-current={activeSection === section.id ? "location" : undefined} onClick={event => navigateSection(event, section.id)}>{section.title}</a>
      </li>)}</ul>
    </nav>}
  </div>;
}
