"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { SettingsNavigation } from "./settings-navigation";
import "./settings.css";

type Heading = { id: string; title: string };

export function SettingsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="workspace-settings">
    <SettingsNavigation />
    <SettingsReader key={pathname} pathname={pathname}>{children}</SettingsReader>
  </div>;
}

function SettingsReader({ pathname, children }: { pathname: string; children: ReactNode }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [active, setActive] = useState("");
  const [long, setLong] = useState(false);

  useEffect(() => {
    const content = contentRef.current;
    const inner = innerRef.current;
    if (!content || !inner) return;
    let frame = 0;
    let hashPending = true;
    const scrollToHash = () => {
      const target = Array.from(inner.querySelectorAll<HTMLElement>("[id]")).find(item => `#${item.id}` === window.location.hash && item.getClientRects().length);
      if (target) {
        content.scrollTo({ top: target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 12, behavior: "instant" });
        target.focus({ preventScroll: true });
        hashPending = false;
      }
    };
    const update = () => {
      // Ignore retained hidden route content, individual listing titles and
      // summary tiles; streamed section headings arrive through this observer.
      const elements = Array.from(inner.querySelectorAll<HTMLElement>("h2, h3")).filter(heading => heading.getClientRects().length && !heading.closest("article") && !heading.parentElement?.parentElement?.classList.contains("grid"));
      const used = new Set<string>();
      const items = elements.map((heading, index) => {
        let id = heading.id || `settings-${pathname.split("/").at(-1)}-${index}-${(heading.textContent || "section").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
        if (used.has(id)) id = `${id}-${index}`;
        used.add(id);
        if (!heading.id) heading.id = id;
        heading.tabIndex = -1;
        return { id: heading.id, title: heading.textContent?.trim() || "Section" };
      });
      setHeadings(previous => JSON.stringify(previous) === JSON.stringify(items) ? previous : items);
      setLong(content.scrollHeight > content.clientHeight + 40);
      const top = content.getBoundingClientRect().top;
      let current = elements[0]?.id || "";
      for (const element of elements) if (element.getBoundingClientRect().top <= top + 48) current = element.id;
      if (content.scrollHeight > content.clientHeight && content.scrollTop + content.clientHeight >= content.scrollHeight - 2) current = elements.at(-1)?.id || "";
      setActive(current);
      if (hashPending) scrollToHash();
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); };
    const onHash = () => { hashPending = true; scrollToHash(); schedule(); };
    const mutation = new MutationObserver(schedule);
    mutation.observe(inner, { childList: true, subtree: true, characterData: true });
    const resize = new ResizeObserver(schedule);
    resize.observe(inner); resize.observe(content);
    content.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("hashchange", onHash);
    window.addEventListener("popstate", onHash);
    schedule();
    return () => {
      cancelAnimationFrame(frame); mutation.disconnect(); resize.disconnect();
      content.removeEventListener("scroll", schedule);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
    };
  }, [pathname]);

  function navigate(event: MouseEvent<HTMLAnchorElement>, id: string) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const content = contentRef.current;
    const target = Array.from(innerRef.current?.querySelectorAll<HTMLElement>("[id]") || []).find(item => item.id === id);
    if (!content || !target) return;
    event.preventDefault();
    if (window.location.hash !== `#${id}`) history.pushState(null, "", `#${id}`);
    target.focus({ preventScroll: true });
    content.scrollTo({ top: target.getBoundingClientRect().top - content.getBoundingClientRect().top + content.scrollTop - 12, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  const showContents = long && headings.length > 1;
  return <div className="workspace-settings-main" data-has-contents={showContents}>
    <div ref={contentRef} className="workspace-settings-content" tabIndex={0} role="region" aria-label="Selected settings section">
      <div ref={innerRef} className="workspace-settings-inner">{children}</div>
    </div>
    {showContents && <nav className="workspace-settings-contents" aria-label="On this page">
      <p>On this page</p>
      {headings.map(heading => <a key={heading.id} href={`#${heading.id}`} aria-current={active === heading.id ? "location" : undefined} onClick={event => navigate(event, heading.id)}>{heading.title}</a>)}
    </nav>}
  </div>;
}
