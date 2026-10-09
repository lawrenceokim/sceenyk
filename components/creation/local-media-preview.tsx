"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { AudioLines, TriangleAlert } from "lucide-react";
import type { LocalMedia } from "./creation-options";

const noServerUrl = () => null;

function createPreviewSource(file: File) {
  let currentUrl: string | null = null;
  return {
    getSnapshot: () => currentUrl,
    subscribe: (notify: () => void) => {
      const url = URL.createObjectURL(file);
      currentUrl = url;
      notify();
      return () => {
        URL.revokeObjectURL(url);
        if (currentUrl === url) currentUrl = null;
      };
    },
  };
}

function useObjectUrl(file: File) {
  // The subscription owns this browser resource. Render never creates a URL.
  // React Strict Mode and cached-route reactivation both clean up/recreate it.
  const source = useMemo(() => createPreviewSource(file), [file]);
  return useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
    noServerUrl,
  );
}

export function LocalMediaPreview({ media }: { media: LocalMedia }) {
  const url = useObjectUrl(media.file);
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-lg bg-field p-5 text-center">
        <TriangleAlert className="size-6 text-warning" aria-hidden="true" />
        <p role="status" className="text-body-sm text-muted-foreground">
          Your browser couldn’t preview this file. You can remove it or try
          another format.
        </p>
      </div>
    );
  if (!url) return <div className="min-h-48 rounded-lg bg-field" />;
  if (media.kind === "image")
    return (
      <div className="relative h-64 overflow-hidden rounded-lg bg-field">
        <Image
          src={url}
          alt={`Local source: ${media.file.name}`}
          fill
          unoptimized
          sizes="(max-width: 1023px) 100vw, 420px"
          className="object-contain"
          onError={() => setFailed(true)}
        />
      </div>
    );
  if (media.kind === "video")
    return (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        aria-label={`Local video preview: ${media.file.name}`}
        className="max-h-72 w-full rounded-lg bg-neutral-950"
        onError={() => setFailed(true)}
      />
    );
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-5 rounded-lg bg-field p-4">
      <AudioLines className="size-10 text-link" aria-hidden="true" />
      <audio
        src={url}
        controls
        preload="metadata"
        aria-label={`Local audio preview: ${media.file.name}`}
        className="w-full min-w-0"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
