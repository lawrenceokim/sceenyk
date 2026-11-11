"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import type { ProjectAsset } from "@/lib/media/types";
import { MediaPreviewSkeleton } from "@/components/ui/skeleton";
import { useProjectMedia, useVisibleProjectMedia } from "./projects-cache-context";

export function ProjectPreview({ asset, children }: { asset?: ProjectAsset | null; children: ReactNode }) {
  const { root, visible } = useVisibleProjectMedia();
  const { media: source, loaded } = useProjectMedia(`thumbnail:${asset?.projectId}:${asset?.id}`, "/api/projects/thumbnail",
    { projectId: asset?.projectId ?? "", assetId: asset?.id ?? "" }, !!asset && visible);
  const [failed, setFailed] = useState<string | null>(null);
  if (!asset) return <div ref={root} className="absolute inset-0">{children}</div>;
  return <div ref={root} className="absolute inset-0">
    {children}
    {source && failed !== source.url && <>
    {asset.kind === "image"
      ? <Image src={source.url} alt={`Saved project source: ${asset.filename}`} fill unoptimized sizes="(max-width: 767px) 100vw, 206px" onLoad={loaded} onError={() => setFailed(source.url)} />
      : <video src={visible ? source.url : undefined} muted playsInline preload="metadata" aria-label={`Saved project source: ${asset.filename}`} onLoadedMetadata={loaded} onError={() => setFailed(source.url)} />}
    {!source.loaded && <MediaPreviewSkeleton overlay />}
    <span className={`
      workspace-project-source-label [&&]:absolute [&&]:bottom-[5px] [&&]:left-[5px] [&&]:pt-[1px] [&&]:pr-[5px]
      [&&]:pb-[1px] [&&]:pl-[5px] [&&]:rounded-[4px] [&&]:[background:var(--card)] [&&]:text-[color:var(--muted-foreground)]
      [&&]:text-[length:9px] [&&]:leading-[14px]
    `}>Source preview</span>
    </>}
  </div>;
}
