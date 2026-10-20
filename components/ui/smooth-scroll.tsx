"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Lenis from "lenis";

// One controller per active ordinary surface; isolated editors/readers stay native.
// Native scroll positions and events remain the source for IntersectionObservers.
export function SmoothScroll({ workspace = false }: { workspace?: boolean }) {
  const marker = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const page = workspace ? marker.current?.closest<HTMLElement>("[data-workspace-page]") : null;
    if (workspace && (!page || page.dataset.workspacePage === "studio" || ["documentation", "settings"].includes(page.dataset.workspaceView ?? ""))) return;

    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let lenis: Lenis | undefined;
    let currentWrapper: HTMLElement | Window | undefined;
    const modalOpen = () => Boolean(document.querySelector('dialog:modal, [role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]'))
      || /hidden|clip/.test(document.body.style.overflow + document.documentElement.style.overflow);
    const syncLock = () => {
      if (!lenis) return;
      if (modalOpen()) lenis.stop();
      else lenis.start();
    };
    const sync = () => {
      let wrapper: HTMLElement | Window = window;
      if (page) {
        let candidate: HTMLElement | null = page;
        while (candidate && candidate !== document.body) {
          if (/auto|scroll/.test(getComputedStyle(candidate).overflowY)) { wrapper = candidate; break; }
          candidate = candidate.parentElement;
        }
      }
      if (!reduced.matches && wrapper === currentWrapper && lenis) return;
      lenis?.destroy();
      lenis = undefined;
      currentWrapper = undefined;
      if (reduced.matches) return;
      currentWrapper = wrapper;
      lenis = new Lenis({
        wrapper,
        content: wrapper === window ? document.documentElement : page ?? document.documentElement,
        autoRaf: true,
        lerp: 0.18,
        smoothWheel: true,
        syncTouch: false,
        allowNestedScroll: true,
        // Fixed mobile gallery frames grow internally when more cards arrive.
        naiveDimensions: wrapper === page,
        anchors: false,
        stopInertiaOnNavigate: true,
        prevent: node => node.matches('textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"], dialog'),
      });
      syncLock();
    };
    // Let native keys, focus, anchors and history interrupt residual wheel inertia.
    const interrupt = () => lenis?.scrollTo(lenis.actualScroll, { immediate: true, force: true });
    const keydown = (event: KeyboardEvent) => {
      if (["Tab", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Escape"].includes(event.key)) interrupt();
    };
    const locks = new MutationObserver(syncLock);
    locks.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "data-open"] });
    const bodyStyle = new MutationObserver(syncLock);
    bodyStyle.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    bodyStyle.observe(document.documentElement, { attributes: true, attributeFilter: ["style"] });
    sync();
    reduced.addEventListener("change", sync);
    window.addEventListener("resize", sync);
    window.addEventListener("popstate", interrupt);
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("pointerdown", interrupt, true);
    document.addEventListener("focusin", interrupt);
    document.addEventListener("click", interrupt, true);
    return () => {
      lenis?.destroy();
      locks.disconnect();
      bodyStyle.disconnect();
      reduced.removeEventListener("change", sync);
      window.removeEventListener("resize", sync);
      window.removeEventListener("popstate", interrupt);
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("pointerdown", interrupt, true);
      document.removeEventListener("focusin", interrupt);
      document.removeEventListener("click", interrupt, true);
    };
  }, [pathname, workspace]);

  return <span ref={marker} hidden aria-hidden="true" />;
}
