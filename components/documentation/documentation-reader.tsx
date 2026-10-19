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
        current = headings.at(-1)?.id;
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

  return <div className="workspace-doc-reader" data-has-contents={showContents}>
    <header className="workspace-doc-header">
      <h1>Documentation</h1>
      <p>{topic.description}</p>
    </header>
    <article ref={articleRef} aria-label={topic.label} tabIndex={0} className="workspace-doc-article">
      {children}
    </article>
    {showContents && <nav aria-label="On this page" className="workspace-doc-contents">
      <p>On this page</p>
      <ul>{topic.sections.map(section => <li key={section.id}>
        <a href={`#${section.id}`} aria-current={activeSection === section.id ? "location" : undefined} onClick={event => navigateSection(event, section.id)}>{section.title}</a>
      </li>)}</ul>
    </nav>}
  </div>;
}
