"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { readTemplateSourceAction } from "@/app/actions/marketplace";
import { MediaPreviewSkeleton } from "@/components/ui/skeleton";

export function TemplateMediaPreview({ listingId, previewUrl, owned, large, children }: {
  listingId?: string; previewUrl?: string | null; owned?: boolean; large?: boolean; children: ReactNode;
}) {
  const [source, setSource] = useState<{ id: string; url: string; kind: "image" | "video" } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [settledListingId, setSettledListingId] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!owned || !listingId || previewUrl) return;
    let active = true;
    void readTemplateSourceAction(listingId).then(result => {
      if (!active) return;
      setSettledListingId(listingId);
      if (result) setSource({ id: listingId, ...result });
    }).catch(() => { if (active) setSettledListingId(listingId); });
    return () => { active = false; };
  }, [listingId, owned, previewUrl]);
  const media = previewUrl ? { url: previewUrl, kind: "image" as const } : source?.id === listingId ? source : null;
  if (owned && listingId && !previewUrl && settledListingId !== listingId) return <MediaPreviewSkeleton className={large ? "aspect-square w-full" : "aspect-[4/3] w-full"} />;
  if (!media || failed === media.url) return children;
  return <div className={`relative w-full overflow-hidden bg-muted ${large ? "aspect-square" : "aspect-[4/3]"}`}>
    {media.kind === "image"
      ? <Image src={media.url} alt="Template preview" fill unoptimized sizes={large ? "(max-width: 767px) 100vw, 70vw" : "(max-width: 767px) 100vw, 250px"} className="object-cover" onLoad={() => setLoadedUrl(media.url)} onError={() => setFailed(media.url)} />
      : <video src={media.url} muted playsInline preload="metadata" controls={large} className="absolute inset-0 size-full object-cover" aria-label="Template video preview" onLoadedMetadata={() => setLoadedUrl(media.url)} onError={() => setFailed(media.url)} />}
    {loadedUrl !== media.url && <MediaPreviewSkeleton overlay />}
  </div>;
}

// A browser-decoded still is a public preview representation, never the private
// original video/audio or its storage URL. The server re-encodes it again.
export async function templatePreviewPoster(listingId: string): Promise<FormData | undefined> {
  const source = await readTemplateSourceAction(listingId);
  if (!source) return;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Preview unavailable");
  let width: number, height: number;
  const element = source.kind === "image" ? new window.Image() : document.createElement("video");
  element.crossOrigin = "anonymous";
  const ready = new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Preview timed out")), 15000);
    const cleanup = () => window.clearTimeout(timeout);
    element.onerror = () => { cleanup(); reject(new Error("Preview unavailable")); };
    if (element instanceof HTMLVideoElement) {
      element.muted = true; element.playsInline = true; element.preload = "auto";
      element.onloadeddata = () => { cleanup(); resolve(); };
    } else element.onload = () => { cleanup(); resolve(); };
  });
  try {
    element.src = source.url;
    await ready;
    if (element instanceof HTMLVideoElement) { width = element.videoWidth; height = element.videoHeight; }
    else { width = element.naturalWidth; height = element.naturalHeight; }
    if (!width || !height) throw new Error("Preview unavailable");
    const scale = Math.min(1, 960 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    context.drawImage(element, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Preview unavailable")), "image/webp", 0.78));
    if (blob.type !== "image/webp" || blob.size > 524288) throw new Error("Preview too large");
    const form = new FormData(); form.set("preview", blob, "preview.webp"); return form;
  } finally {
    element.src = "";
    if (element instanceof HTMLVideoElement) element.load();
  }
}
