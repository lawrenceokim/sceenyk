"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Image from "next/image";
import { useVisibleProjectMedia } from "@/components/projects/projects-cache-context";
import { useMarketplacePreview } from "./gallery-cache";

const motionQuery = "(prefers-reduced-motion: reduce)";
const noChanges = () => () => {};
const subscribeMotion = (change: () => void) => {
  const query = window.matchMedia(motionQuery); query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
};
const subscribeVisibility = (change: () => void) => {
  document.addEventListener("visibilitychange", change); return () => document.removeEventListener("visibilitychange", change);
};
function PlayingListingPreview({ listingId }: { listingId: string }) {
  const preview = useMarketplacePreview(listingId), video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState<string | null>(null), [failed, setFailed] = useState(false);
  const url = preview?.url;
  useEffect(() => {
    const element = video.current;
    if (!element || !url || failed) return;
    let active = true;
    element.muted = true;
    element.src = url;
    void element.play().catch(() => { if (active) setFailed(true); });
    return () => { active = false; element.pause(); element.removeAttribute("src"); element.load(); };
  }, [url, failed]);
  if (!preview || failed) return null;
  return <video ref={video} src={preview.url} autoPlay muted loop playsInline preload="none" controls={false}
    disablePictureInPicture tabIndex={-1} aria-hidden="true"
    className={`pointer-events-none absolute inset-0 size-full object-cover ${playing === preview.url ? "opacity-100" : "opacity-0"}`}
    onPlaying={() => setPlaying(preview.url)} onWaiting={() => setPlaying(null)} onError={() => setFailed(true)} />;
}
export function ListingVideoPreview({ listingId, version, posterUrl, children }: { listingId: string; version: string | null; posterUrl: string | null; children: ReactNode }) {
  const { root, visible } = useVisibleProjectMedia();
  const reduce = useSyncExternalStore(subscribeMotion, () => window.matchMedia(motionQuery).matches, () => true);
  const pageVisible = useSyncExternalStore(subscribeVisibility, () => document.visibilityState === "visible", () => false);
  const poster = useMarketplacePreview(listingId, "poster", !!posterUrl && visible && pageVisible);
  const noObserver = useSyncExternalStore(noChanges, () => typeof IntersectionObserver === "undefined", () => false);
  const imageUrl = noObserver ? posterUrl : poster?.url;
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  return <div ref={root} className="relative w-full">
    {children}
    {posterUrl && imageUrl && failedPoster !== imageUrl && <Image src={imageUrl} alt="Template preview" fill unoptimized sizes="(max-width: 767px) 100vw, 250px" className="object-cover" onError={() => setFailedPoster(imageUrl)} />}
    {version && visible && pageVisible && !reduce && <PlayingListingPreview key={`${listingId}:${version}`} listingId={listingId} />}
  </div>;
}
