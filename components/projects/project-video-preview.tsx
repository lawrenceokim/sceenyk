"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { ProjectCardStatus } from "@/lib/projects/card-status";
import { useProjectCardStatus } from "./project-job-statuses";
import { useProjectMedia } from "./projects-cache-context";

const motionQuery = "(prefers-reduced-motion: reduce)";
function subscribeMotion(callback: () => void) {
  const query = window.matchMedia(motionQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
function subscribeVisibility(callback: () => void) {
  document.addEventListener("visibilitychange", callback);
  return () => document.removeEventListener("visibilitychange", callback);
}
const reducedMotion = () => window.matchMedia(motionQuery).matches;
const documentVisible = () => document.visibilityState === "visible";
const initiallyReduced = () => true;
const initiallyHidden = () => false;

// Mounted only while visible; bytes survive playback cleanup in the session cache.
function PlayingPreview({ projectId }: { projectId: string }) {
  const { media: preview } = useProjectMedia(`video:${projectId}`, "/api/projects/video-preview", { projectId });
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const previewUrl = preview?.url;
  useEffect(() => {
    const element = video.current;
    if (!element || !previewUrl || failed) return;
    let active = true;
    element.muted = true;
    element.src = previewUrl;
    void element.play().catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      element.pause();
      element.removeAttribute("src");
      element.load();
    };
  }, [previewUrl, failed]);
  if (!preview || failed) return null;
  return <video ref={video} src={preview.url} autoPlay muted loop playsInline preload="none" controls={false}
    disablePictureInPicture tabIndex={-1} aria-hidden="true"
    className={`pointer-events-none absolute inset-0 size-full object-cover ${playingUrl === preview.url ? "opacity-100" : "opacity-0"}`}
    onPlaying={() => setPlayingUrl(preview.url)} onWaiting={() => setPlayingUrl(null)} onError={() => setFailed(true)} />;
}

export function ProjectVideoPreview({ projectId, initialStatus, children }: {
  projectId: string; initialStatus?: ProjectCardStatus; children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null), [visible, setVisible] = useState(false);
  const reduce = useSyncExternalStore(subscribeMotion, reducedMotion, initiallyReduced);
  const pageVisible = useSyncExternalStore(subscribeVisibility, documentVisible, initiallyHidden);
  const status = useProjectCardStatus(projectId, initialStatus);
  useEffect(() => {
    const element = root.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0), { threshold: 0 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className="absolute inset-0">
    <div className="absolute inset-0">{children}</div>
    {visible && pageVisible && !reduce && status === "final_approved" && <PlayingPreview key={projectId} projectId={projectId} />}
  </div>;
}
