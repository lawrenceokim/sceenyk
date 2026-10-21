"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { readMediaAction } from "@/app/actions/media";
import type { ProjectAsset } from "@/lib/media/types";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { MediaPreviewSkeleton } from "@/components/ui/skeleton";

export function PersistentMediaPreview({ asset, thumbnail = false }: { asset: ProjectAsset; thumbnail?: boolean }) {
  const [source, setSource] = useState<{ url?: string; error?: string }>({});
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    readMediaAction({ projectId: asset.projectId, assetId: asset.id })
      .then((result) => {
        if (active)
          setSource(
            result.ok ? { url: result.value.url } : { error: result.message },
          );
      })
      .catch(() => {
        if (active)
          setSource({ error: "Preview couldn’t be loaded. Try again." });
      });
    return () => {
      active = false;
    };
  }, [asset.id, asset.projectId, refresh]);
  const failed = () =>
    setSource({
      error:
        "Your browser couldn’t play this file, or its private preview link expired.",
    });
  if (thumbnail) {
    if (source.error) return <button type="button" className="flex size-full cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Refresh preview for ${asset.filename}`} title={source.error}
      onClick={() => { setSource({}); setRefresh(value => value + 1); }}>
      <RefreshCw className="size-4" aria-hidden="true" />
    </button>;
    return source.url ? <Image src={source.url} alt={asset.filename} fill unoptimized sizes="64px" className="object-cover" onError={failed} />
      : <MediaPreviewSkeleton className="size-full rounded-md" />;
  }
  if (source.error)
    return (
      <div className="rounded-lg bg-field p-5">
        <p role="status" className="text-body-sm text-muted-foreground">
          {source.error}
        </p>
        <Button
          type="button"
          variant="outline"
          className="mt-3"
          onClick={() => {
            setSource({});
            setRefresh((value) => value + 1);
          }}
        >
          Refresh preview
        </Button>
      </div>
    );
  if (!source.url)
    return (
      <MediaPreviewSkeleton className={asset.kind === "audio" ? "h-48 w-full rounded-lg" : "h-64 w-full rounded-lg"} />
    );
  if (asset.kind === "image")
    return (
      <div className="relative h-64 overflow-hidden rounded-lg bg-field">
        <Image
          src={source.url}
          alt={`Project source: ${asset.filename}`}
          fill
          unoptimized
          sizes="(max-width: 1023px) 100vw, 420px"
          className="object-contain"
          onError={failed}
        />
      </div>
    );
  if (asset.kind === "video")
    return (
      <video
        src={source.url}
        controls
        playsInline
        preload="metadata"
        aria-label={`Project video preview: ${asset.filename}`}
        className="max-h-72 w-full rounded-lg bg-neutral-950"
        onError={failed}
      />
    );
  return (
    <div className="flex min-h-48 items-center rounded-lg bg-field p-4">
      <audio
        src={source.url}
        controls
        preload="metadata"
        aria-label={`Project audio preview: ${asset.filename}`}
        className="w-full min-w-0"
        onError={failed}
      />
    </div>
  );
}
