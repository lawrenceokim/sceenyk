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
    {media || asset ? <div className="studio-media">
      {media ? <LocalMediaPreview key={media.id} media={media} /> : asset && <PersistentMediaPreview key={asset.id} asset={asset} />}
      <p className="mt-3 break-all text-body-sm font-medium">{media?.file.name ?? asset?.filename}</p>
      <p className="mt-1 text-caption text-muted-foreground">Source preview · {media ? "On this device only" : "Uploaded · Private"} · Not a generated result</p>
    </div> : <div className="studio-empty">
      <div className="flex h-36 max-w-full items-center justify-center rounded-xl border border-dashed border-input bg-card" style={{ aspectRatio: settings.aspectRatio.replace(":", " / ") }}>
        <Clapperboard className="size-9 text-link" aria-hidden="true" />
      </div>
      <div><h2 className="text-xl font-semibold tracking-tight">Your next scene starts here</h2>
        <p className="mx-auto mt-2 max-w-72 text-body-sm text-muted-foreground">Describe your idea in Properties, or open Sources to bring your own media.</p>
      </div>
      <p className="text-caption text-muted-foreground">{category.title} · {settings.aspectRatio} · {settings.duration} sec</p>
    </div>}
    {prompt.trim() && <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-caption text-muted-foreground">{prompt}</p>}
  </div>;
}
