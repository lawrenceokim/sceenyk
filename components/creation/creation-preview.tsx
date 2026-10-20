import { Clapperboard } from "lucide-react";
import { LocalMediaPreview } from "./local-media-preview";
import { PersistentMediaPreview } from "./persistent-media-preview";
import type { ProjectAsset } from "@/lib/media/types";
import type { CreationSettings, LocalMedia } from "./creation-options";

export function CreationPreview({ settings, media, asset }: {
  settings: CreationSettings;
  media?: LocalMedia; asset?: ProjectAsset;
}) {
  return <div aria-label="Creation preview">
    {media || asset ? <div className={`
      studio-media max-767:[&&_>_*:first-child]:min-h-0 max-767:[&&_>_*:first-child]:h-auto max-767:[&&_>_*:first-child]:flex-1 max-767:[&&_video]:max-h-full max-767:[&&_video]:min-h-0 max-767:[&&_video]:object-contain [&&]:[flex:1] [&&]:min-h-[0] [&&]:flex [&&]:flex-col [&&]:rounded-[var(--ui-radius-media)]
      [&&]:[background:var(--background)] [&&_>_div.relative]:[flex:auto] [&&_>_div.relative]:min-h-[200px]
      [&&_>_div.relative]:rounded-[var(--ui-radius-media)] [&&_>_div.relative]:h-[clamp(180px,_40cqw,_300px)]
      [&&_video]:rounded-[var(--ui-radius-media)] [&&_video]:max-h-[40dvh] min-[768px]:[&&_>_div.relative]:h-[auto]
      min-[768px]:[&&_>_div.relative]:min-h-[120px] min-[768px]:[&&_>_div.relative]:[flex:1]
      min-[1024px]:@min-[930px]:[&&_>_div.relative]:min-h-[200px] min-[1024px]:@min-[930px]:[&&_video]:max-h-[72dvh]
    `}>
      {media ? <LocalMediaPreview key={media.id} media={media} /> : asset && <PersistentMediaPreview key={asset.id} asset={asset} />}
      <p className="mt-3 truncate text-body-sm font-medium">{media?.file.name ?? asset?.filename}</p>
      <p className="mt-1 text-caption text-muted-foreground">Source · {media ? "Local" : "Uploaded · Private"}</p>
    </div> : <div className={`
      studio-empty max-767:[&&]:min-h-0 max-767:[&&]:gap-2 max-767:[&&]:p-2 [&&]:[flex:1] [&&]:min-h-[190px] [&&]:flex [&&]:flex-col [&&]:items-center [&&]:justify-center
      [&&]:gap-[12px] [&&]:text-center [&&]:pt-[20px] [&&]:pr-[16px] [&&]:pb-[20px] [&&]:pl-[16px]
      [&&]:rounded-[var(--ui-radius-media)] [&&]:[background:var(--background)] min-[768px]:[&&]:min-h-[126px]
      min-[768px]:[&&]:pt-[12px] min-[768px]:[&&]:pr-[12px] min-[768px]:[&&]:pb-[12px] min-[768px]:[&&]:pl-[12px]
      min-[768px]:[&&]:gap-[8px] min-[768px]:[&&_>_svg]:hidden min-[1024px]:@min-[930px]:[&&]:pt-[24px]
      min-[1024px]:@min-[930px]:[&&]:pr-[24px] min-[1024px]:@min-[930px]:[&&]:pb-[24px]
      min-[1024px]:@min-[930px]:[&&]:pl-[24px] min-[1024px]:@min-[930px]:[&&]:gap-[16px]
      min-[1024px]:@min-[930px]:[&&_>_svg]:block
    `}>
      <Clapperboard className="size-7 text-muted-foreground" aria-hidden="true" />
      <div><h2 className="text-base font-medium tracking-tight">Preview</h2>
      </div>
      <p className="text-caption text-muted-foreground">UGC · {settings.aspectRatio} · {settings.duration} sec</p>
    </div>}
  </div>;
}
