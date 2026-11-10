"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function PurchasePreview({
  url,
  title,
  large = false,
}: {
  url: string | null;
  title: string;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <div
      className={`relative grid w-full place-items-center overflow-hidden bg-muted ${large ? "aspect-[7/5] rounded-xl border border-border" : "aspect-video rounded-lg"}`}
    >
      {url && !failed ? (
        <>
          <Image
            src={url}
            alt={`${title} template preview`}
            fill
            unoptimized
            sizes={
              large
                ? "(max-width: 1023px) 100vw, 55vw"
                : "(max-width: 639px) 100vw, 360px"
            }
            className="object-cover"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
          {!loaded && (
            <Skeleton className="absolute inset-0 size-full rounded-none" />
          )}
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 px-4 text-center text-xs text-muted-foreground">
          <ImageIcon aria-hidden="true" className="size-6" />
          <span>No shared preview available</span>
        </div>
      )}
    </div>
  );
}
