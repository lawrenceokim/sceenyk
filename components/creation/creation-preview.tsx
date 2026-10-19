import { Clapperboard } from "lucide-react";
import { LocalMediaPreview } from "./local-media-preview";
import { PersistentMediaPreview } from "./persistent-media-preview";
import type { ProjectAsset } from "@/lib/media/types";
import type { CreationCategory, CreationSettings, LocalMedia } from "./creation-options";

export function CreationPreview({ category, settings, prompt, media, asset }: {
  category: CreationCategory; settings: CreationSettings; prompt: string;
  media?: LocalMedia; asset?: ProjectAsset;
}) {
  return <div aria-label="Creation preview">
    {media || asset ? <div className={`
      studio-media [&&]:[flex:1] [&&]:min-h-[0] [&&]:flex [&&]:flex-col [&&]:rounded-[var(--ui-radius-media)]
      [&&]:[background:var(--background)] [&&_>_div.relative]:[flex:auto] [&&_>_div.relative]:min-h-[200px]
      [&&_>_div.relative]:rounded-[var(--ui-radius-media)] [&&_>_div.relative]:h-[clamp(180px,_40cqw,_300px)]
      [&&_video]:rounded-[var(--ui-radius-media)] [&&_video]:max-h-[40dvh] min-[768px]:[&&_>_div.relative]:h-[auto]
      min-[768px]:[&&_>_div.relative]:min-h-[120px] min-[768px]:[&&_>_div.relative]:[flex:1]
      min-[1024px]:@min-[930px]:[&&_>_div.relative]:min-h-[200px] min-[1024px]:@min-[930px]:[&&_video]:max-h-[72dvh]
    `}>
      {media ? <LocalMediaPreview key={media.id} media={media} /> : asset && <PersistentMediaPreview key={asset.id} asset={asset} />}
      <p className="mt-3 break-all text-body-sm font-medium">{media?.file.name ?? asset?.filename}</p>
      <p className="mt-1 text-caption text-muted-foreground">Source preview · {media ? "On this device only" : "Uploaded · Private"} · Not a generated result</p>
    </div> : <div className={`
      studio-empty [&&]:[flex:1] [&&]:min-h-[190px] [&&]:flex [&&]:flex-col [&&]:items-center [&&]:justify-center
      [&&]:gap-[12px] [&&]:text-center [&&]:pt-[20px] [&&]:pr-[16px] [&&]:pb-[20px] [&&]:pl-[16px]
      [&&]:rounded-[var(--ui-radius-media)] [&&]:[background:var(--background)] min-[768px]:[&&]:min-h-[126px]
      min-[768px]:[&&]:pt-[12px] min-[768px]:[&&]:pr-[12px] min-[768px]:[&&]:pb-[12px] min-[768px]:[&&]:pl-[12px]
      min-[768px]:[&&]:gap-[8px] min-[768px]:[&&_>_svg]:hidden min-[1024px]:@min-[930px]:[&&]:pt-[24px]
      min-[1024px]:@min-[930px]:[&&]:pr-[24px] min-[1024px]:@min-[930px]:[&&]:pb-[24px]
      min-[1024px]:@min-[930px]:[&&]:pl-[24px] min-[1024px]:@min-[930px]:[&&]:gap-[16px]
      min-[1024px]:@min-[930px]:[&&_>_svg]:block
    `}>
      <Clapperboard className="size-7 text-muted-foreground" aria-hidden="true" />
      <div><h2 className="text-base font-medium tracking-tight">Your next scene starts here</h2>
        <p className="mx-auto mt-2 max-w-72 text-body-sm text-muted-foreground">Describe your idea in Properties, or open Sources to bring your own media.</p>
      </div>
      <p className="text-caption text-muted-foreground">{category.title} · {settings.aspectRatio} · {settings.duration} sec</p>
    </div>}
    {prompt.trim() && <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-caption text-muted-foreground">{prompt}</p>}
  </div>;
}
