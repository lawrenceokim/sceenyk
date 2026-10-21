"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { readMediaAction } from "@/app/actions/media";
import type { ProjectAsset } from "@/lib/media/types";
import { MediaPreviewSkeleton } from "@/components/ui/skeleton";

export function ProjectPreview({ asset, children }: { asset?: ProjectAsset | null; children: ReactNode }) {
  const [source, setSource] = useState<{ assetId: string; url: string } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [settledAssetId, setSettledAssetId] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!asset) return;
    let active = true;
    readMediaAction({ projectId: asset.projectId, assetId: asset.id }).then(result => {
      if (!active) return;
      setSettledAssetId(asset.id);
      if (result.ok) setSource({ assetId: asset.id, url: result.value.url });
    }).catch(() => { if (active) setSettledAssetId(asset.id); });
    return () => { active = false; };
  }, [asset]);
  if (!asset) return children;
  if (settledAssetId !== asset.id) return <MediaPreviewSkeleton overlay />;
  if (source?.assetId !== asset.id || failed === source.url) return children;
  return <>
    {asset.kind === "image"
      ? <Image src={source.url} alt={`Saved project source: ${asset.filename}`} fill unoptimized sizes="(max-width: 767px) 100vw, 206px" onLoad={() => setLoadedUrl(source.url)} onError={() => setFailed(source.url)} />
      : <video src={source.url} muted playsInline preload="metadata" aria-label={`Saved project source: ${asset.filename}`} onLoadedMetadata={() => setLoadedUrl(source.url)} onError={() => setFailed(source.url)} />}
    {loadedUrl !== source.url && <MediaPreviewSkeleton overlay />}
    <span className={`
      workspace-project-source-label [&&]:absolute [&&]:bottom-[5px] [&&]:left-[5px] [&&]:pt-[1px] [&&]:pr-[5px]
      [&&]:pb-[1px] [&&]:pl-[5px] [&&]:rounded-[4px] [&&]:[background:var(--card)] [&&]:text-[color:var(--muted-foreground)]
      [&&]:text-[length:9px] [&&]:leading-[14px]
    `}>Source preview</span>
  </>;
}
