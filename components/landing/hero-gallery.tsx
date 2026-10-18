"use client";

import Image from "next/image";
import { useEffect, useRef, type CSSProperties } from "react";
import { landingArtwork } from "./artwork";
import { landingStyles as styles } from "./landing-styles";

// Percentage geometry scales with the viewport; repeated artwork reuses the
// same optimized image requests instead of introducing more source assets.
const images = [
  { image: "mountains", x: -4, y: 14, width: 16, height: 20, rotation: -9, depth: 0.35 },
  { image: "portrait", x: 10, y: 12, width: 16, height: 29, rotation: 7, depth: 0.75 },
  { image: "landscape", x: 28, y: 9, width: 14, height: 19, rotation: 6, depth: 0.4 },
  { image: "city", x: 31, y: 29, width: 17, height: 20, rotation: 6, depth: 0.8 },
  { image: "moon", x: 44, y: 14, width: 13, height: 31, rotation: -9, depth: 1 },
  { image: "underwater", x: 56, y: 8, width: 15, height: 23, rotation: 6, depth: 0.45 },
  { image: "eye", x: 68, y: 15, width: 15, height: 27, rotation: -12, depth: 0.55 },
  { image: "flower", x: 77, y: 36, width: 17, height: 22, rotation: 7, depth: 0.95 },
  { image: "astronaut", x: 67, y: 49, width: 14, height: 18, rotation: 9, depth: 1 },
  { image: "explorer", x: 88, y: 12, width: 13, height: 27, rotation: -9, depth: 0.65 },
  { image: "underwater", x: -4, y: 40, width: 16, height: 20, rotation: 8, depth: 0.45 },
  { image: "astronaut", x: 10, y: 45, width: 15, height: 18, rotation: -8, depth: 0.8 },
  { image: "flower", x: 21, y: 39, width: 14, height: 20, rotation: 8, depth: 0.95 },
  { image: "explorer", x: 38, y: 48, width: 10, height: 19, rotation: -7, depth: 0.65 },
  { image: "landscape", x: 49, y: 43, width: 16, height: 20, rotation: -6, depth: 0.4 },
  { image: "city", x: 57, y: 55, width: 12, height: 15, rotation: 7, depth: 0.8 },
  { image: "moon", x: 88, y: 46, width: 12, height: 23, rotation: -8, depth: 1 },
  { image: "mountains", x: 96, y: 36, width: 14, height: 18, rotation: 9, depth: 0.35 },
  { image: "eye", x: -43, y: 3, width: 54, height: 86, rotation: 12, depth: 0.3, edge: "left" },
  { image: "underwater", x: 89, y: 4, width: 52, height: 83, rotation: -12, depth: 0.35, edge: "right" },
] as const;

export function HeroGallery() {
  const gallery = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = gallery.current;
    const hero = element?.closest("[data-landing-page]")?.querySelector<HTMLElement>("[data-landing-hero]");
    if (!element || !hero) return;
    const region = hero;
    const permitted = matchMedia("(hover: hover) and (pointer: fine) and (min-width: 768px) and (prefers-reduced-motion: no-preference)");
    const tiles = Array.from(element.querySelectorAll<HTMLElement>("[data-depth]"));
    let frame = 0;
    let last = 0;
    let x = 0, y = 0, targetX = 0, targetY = 0;
    let visible = true;
    function paint() {
      for (const tile of tiles) {
        const depth = Number(tile.dataset.depth);
        tile.style.setProperty("--move-x", `${(x * depth).toFixed(3)}px`);
        tile.style.setProperty("--move-y", `${(y * depth).toFixed(3)}px`);
      }
    }
    function stop() {
      cancelAnimationFrame(frame);
      frame = 0; last = 0;
      x = y = targetX = targetY = 0;
      paint();
      element?.removeAttribute("data-parallax-active");
    }
    function tick(time: number) {
      const smoothing = 1 - Math.exp(-Math.min(last ? time - last : 16, 64) / 105);
      last = time;
      x += (targetX - x) * smoothing;
      y += (targetY - y) * smoothing;
      if (Math.abs(targetX - x) + Math.abs(targetY - y) < 0.015) {
        x = targetX; y = targetY;
        paint(); frame = 0; last = 0;
        element?.removeAttribute("data-parallax-active");
        return;
      }
      paint(); frame = requestAnimationFrame(tick);
    }
    function schedule() {
      if (!frame && permitted.matches && visible && !document.hidden) {
        element?.setAttribute("data-parallax-active", "");
        frame = requestAnimationFrame(tick);
      }
    }
    function move(event: PointerEvent) {
      if (!permitted.matches || event.pointerType !== "mouse") return;
      const bounds = region.getBoundingClientRect();
      targetX = Math.max(-1, Math.min(1, (event.clientX - bounds.left) / bounds.width * 2 - 1)) * 13;
      targetY = Math.max(-1, Math.min(1, (event.clientY - bounds.top) / bounds.height * 2 - 1)) * 9;
      schedule();
    }
    function rest() { targetX = targetY = 0; schedule(); }
    function preference() { if (!permitted.matches) stop(); }
    function visibility() { if (document.hidden) stop(); }
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (!visible) stop();
    });
    observer.observe(hero);
    hero.addEventListener("pointermove", move, { passive: true });
    hero.addEventListener("pointerleave", rest);
    window.addEventListener("blur", rest);
    document.addEventListener("visibilitychange", visibility);
    permitted.addEventListener("change", preference);
    return () => {
      stop(); observer.disconnect();
      hero.removeEventListener("pointermove", move);
      hero.removeEventListener("pointerleave", rest);
      window.removeEventListener("blur", rest);
      document.removeEventListener("visibilitychange", visibility);
      permitted.removeEventListener("change", preference);
    };
  }, []);
  return (
    <div ref={gallery} className={styles.gallery} data-landing-gallery aria-hidden="true">
      <div className={styles.galleryCanvas}>
        {images.map((item, index) => (
          <div key={`${item.image}-${index}`} className={styles.heroTile} data-depth={item.depth} data-artwork={item.image} data-edge={"edge" in item ? item.edge : undefined}
            style={{ "--tile-x": `${item.x}%`, "--tile-y": `${item.y}%`, "--tile-width": `${item.width}%`, "--tile-height": `${item.height}%`, "--rotation": `${item.rotation}deg` } as CSSProperties}>
            <Image src={landingArtwork[item.image]} alt="" fill sizes={"edge" in item ? "(max-width: 699px) 75vw, 54vw" : "(max-width: 699px) 33vw, (max-width: 1560px) 17vw, 265px"} loading={item.image === "portrait" ? "eager" : "lazy"} fetchPriority={item.image === "portrait" ? "high" : "auto"} className={styles.artwork} />
          </div>
        ))}
      </div>
    </div>
  );
}
