"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { projectsSessionCache } from "@/lib/projects/session-cache";

export const ProjectsCacheScope = createContext<string | null>(null);
const emptySnapshot = () => undefined;

export function useProjectMedia(key: string, endpoint: string, input: Record<string, string>, enabled = true) {
  const scope = useContext(ProjectsCacheScope);
  const media = useSyncExternalStore(projectsSessionCache.subscribe, () => projectsSessionCache.readMedia(scope, key), emptySnapshot);
  const invalidation = useSyncExternalStore(projectsSessionCache.subscribe, () => projectsSessionCache.mediaInvalidation(scope, key), () => 0);
  const inputKey = JSON.stringify(input);
  useEffect(() => {
    if (!scope || !enabled) return;
    let active = true, timer: ReturnType<typeof setTimeout> | undefined;
    if (media) {
      // The video hook is mounted only for a visible, motion-enabled player.
      // Renew early so an unchanged authorized loop keeps playing continuously.
      if (key.startsWith("video:")) timer = setTimeout(() => {
        void projectsSessionCache.loadMedia(scope, key, endpoint, JSON.parse(inputKey), true).catch(() => {});
      }, Math.max(1000, media.expiresAt - Date.now() - 30_000));
      return () => { clearTimeout(timer); };
    }
    const load = async () => {
      try {
        const result = await projectsSessionCache.loadMedia(scope, key, endpoint, JSON.parse(inputKey));
        if (active && result?.pending) { clearTimeout(timer); timer = setTimeout(() => { void load(); }, result.retryAfter); }
      } catch { /* Retain the existing thumbnail; retry on the next activation. */ }
    };
    void load();
    const activate = () => {
      if (document.visibilityState === "visible" && navigator.onLine) { clearTimeout(timer); void load(); }
    };
    window.addEventListener("focus", activate);
    document.addEventListener("visibilitychange", activate);
    // An already-started bounded download may populate memory after leaving.
    // Only an active card starts new work or polls; auth changes abort downloads.
    return () => { active = false; clearTimeout(timer); window.removeEventListener("focus", activate); document.removeEventListener("visibilitychange", activate); };
  }, [scope, key, endpoint, inputKey, enabled, media, invalidation]);
  return { media, loaded: () => { if (scope) projectsSessionCache.loaded(scope, key); } };
}

export function useVisibleProjectMedia() {
  const root = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { root, visible };
}
