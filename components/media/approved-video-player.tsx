"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { LoaderCircle, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppNotification } from "@/components/notifications/app-notification";
import { useCacheIdentity } from "@/components/cache/cache-provider";
import { cn } from "@/lib/utils";

type Props = { src: string; label: string; className?: string; children: ReactNode };
export function ApprovedVideoPlayer(props: Props) {
  const { scope } = useCacheIdentity();
  // Account/session changes discard decoded private media as well as controls.
  return <Playback key={`${scope}:${props.src}`} {...props} />;
}
function Playback({ src, label, className, children }: Props) {
  const video = useRef<HTMLVideoElement>(null), root = useRef<HTMLDivElement>(null);
  const active = useRef(true), attempt = useRef(0);
  const [state, setState] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  useEffect(() => {
    active.current = true;
    const element = video.current;
    const pauseHidden = () => { if (document.visibilityState === "hidden") element?.pause(); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      if (entries.some(entry => !entry.isIntersecting)) element?.pause();
    });
    if (root.current) observer?.observe(root.current);
    document.addEventListener("visibilitychange", pauseHidden);
    return () => { active.current = false; observer?.disconnect(); document.removeEventListener("visibilitychange", pauseHidden); element?.pause(); };
  }, []);
  function failed() {
    if (!active.current || !video.current?.getAttribute("src")) return;
    attempt.current++;
    video.current.pause(); video.current.removeAttribute("src"); video.current.load(); setState("failed");
  }
  function play() {
    const element = video.current;
    if (!element || element.getAttribute("src")) return;
    const current = ++attempt.current;
    setState("loading");
    // No video request, metadata download or signed capability before a click.
    element.src = src;
    void element.play().catch(error => {
      if (!active.current || current !== attempt.current) return;
      if (error?.name === "AbortError") {
        element.removeAttribute("src"); element.load(); setState("idle");
      } else failed();
    });
  }
  function ready() { if (video.current?.getAttribute("src")) setState("ready"); }
  return <div ref={root} className={cn("relative isolate overflow-hidden bg-muted", className)}>
    {(state === "idle" || state === "failed") && children}
    <video ref={video} controls playsInline preload="none" aria-label={label}
      className={cn("absolute inset-0 size-full object-contain", (state === "idle" || state === "failed") && "invisible")}
      onLoadedData={ready} onCanPlay={ready} onPlaying={ready}
      onWaiting={() => { if (video.current?.getAttribute("src")) setState("loading"); }} onError={failed}>
      Your browser does not support video playback.
    </video>
    {(state === "idle" || state === "failed") && <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <Button type="button" variant="secondary" className="pointer-events-auto min-h-11 gap-2 rounded-full border border-border bg-background/90 px-5 text-foreground shadow-sm backdrop-blur-sm" onClick={play} aria-label={state === "failed" ? `Retry ${label}` : `Play ${label}`}>
        {state === "failed" ? <RefreshCw className="size-4" aria-hidden="true" /> : <Play className="size-4" aria-hidden="true" />}{state === "failed" ? "Retry video" : "Play video"}
      </Button>
    </div>}
    {state === "loading" && <span role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/30 text-foreground"><span className="flex items-center gap-2 rounded-lg bg-background/90 px-3 py-2 text-xs"><LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" />Loading video…</span></span>}
    {state === "failed" && <AppNotification role="status">The video couldn’t be played. Your preview is still available; try again.</AppNotification>}
  </div>;
}
