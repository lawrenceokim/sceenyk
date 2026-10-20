"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Motion adds no hidden styles to server HTML. Each major section gets one
// short entrance; there is no scroll handler or perpetual animation loop.
export function LandingMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    if (!element || !window.IntersectionObserver) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const seen = new WeakSet<Element>();
    const tokens = getComputedStyle(element);
    const duration = parseFloat(tokens.getPropertyValue("--motion-reveal")) || 420;
    const easing = tokens.getPropertyValue("--motion-ease").trim();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || seen.has(entry.target)) continue;
        seen.add(entry.target); observer.unobserve(entry.target);
        if (reduced.matches) continue;
        const animation = entry.target.animate(
          [{ opacity: 0.35, transform: "translateY(12px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration, easing },
        );
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
      }
    }, { threshold: 0.08 });
    for (const section of element.querySelectorAll<HTMLElement>("[data-reveal]")) observer.observe(section);
    const cancel = () => { for (const animation of animations) animation.cancel(); animations.clear(); };
    const preference = () => { if (reduced.matches) cancel(); };
    reduced.addEventListener("change", preference);
    element.addEventListener("focusin", cancel);
    return () => { observer.disconnect(); cancel(); reduced.removeEventListener("change", preference); element.removeEventListener("focusin", cancel); };
  }, []);
  return <div ref={root}>{children}</div>;
}
