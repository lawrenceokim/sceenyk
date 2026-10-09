import { Clapperboard, ImagePlay } from "lucide-react";
import { LocalMediaPreview } from "./local-media-preview";
import {
  formatFileSize,
  type CreationCategory,
  type CreationSettings,
  type LocalMedia,
} from "./creation-options";

export function CreationPreview({
  category,
  settings,
  prompt,
  media,
}: {
  category: CreationCategory;
  settings: CreationSettings;
  prompt: string;
  media?: LocalMedia;
}) {
  return (
    <aside className="min-w-0 space-y-5" aria-label="Creation preview">
      <section
        className="sceenyk-card overflow-hidden"
        aria-labelledby="result-heading"
      >
        <div className="flex items-center justify-between gap-2 border-b border-border px-5 py-4">
          <h2 id="result-heading" className="text-body-sm font-semibold">
            Your creation
          </h2>
          <span className="text-caption text-muted-foreground">
            Output preview
          </span>
        </div>
        <div className="flex min-h-80 flex-col items-center justify-center gap-6 bg-field p-6 text-center">
          <div
            aria-hidden="true"
            className="relative flex h-36 max-w-full items-center justify-center rounded-xl border border-dashed border-input bg-card shadow-card"
            style={{ aspectRatio: settings.aspectRatio.replace(":", " / ") }}
          >
            <span className="absolute left-2 top-2 size-2 rounded-full bg-accent-foreground/30" />
            <span className="flex size-14 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Clapperboard className="size-7" />
            </span>
            <span className="absolute bottom-2 right-2 font-mono text-caption text-muted-foreground">
              {settings.aspectRatio}
            </span>
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">
              Your creation will appear here
            </h3>
            <p className="mx-auto mt-2 max-w-72 text-body-sm leading-relaxed text-muted-foreground">
              Shape your idea with a creative brief. Finished videos will arrive
              here when generation is available.
            </p>
          </div>
        </div>
        <div className="space-y-4 border-t border-border p-5">
          <p className="text-caption font-medium tracking-wider text-muted-foreground">
            YOUR CREATIVE BRIEF
          </p>
          <dl className="grid grid-cols-2 gap-4 text-body-sm">
            <div className="col-span-2">
              <dt className="text-caption text-muted-foreground">
                Creation type
              </dt>
              <dd className="mt-1 font-medium">{category.title}</dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">
                Format & duration
              </dt>
              <dd className="mt-1 font-medium">
                {settings.aspectRatio} · {settings.duration} sec
              </dd>
            </div>
            <div>
              <dt className="text-caption text-muted-foreground">
                Style & tone
              </dt>
              <dd className="mt-1 font-medium">
                {settings.visualStyle} · {settings.tone}
              </dd>
            </div>
          </dl>
          {prompt.trim() && (
            <p className="line-clamp-3 whitespace-pre-wrap break-words border-t border-border pt-3 text-body-sm text-muted-foreground">
              {prompt}
            </p>
          )}
        </div>
      </section>
      {media && (
        <section
          className="sceenyk-card p-5"
          aria-labelledby="local-source-heading"
        >
          <h2
            id="local-source-heading"
            className="mb-4 flex items-center gap-2 text-body-sm font-semibold"
          >
            <ImagePlay className="size-4 text-link" aria-hidden="true" />
            Local source preview
          </h2>
          <LocalMediaPreview key={media.id} media={media} />
          <p className="mt-3 break-all text-body-sm font-medium">
            {media.file.name}
          </p>
          <p className="mt-1 text-caption capitalize text-muted-foreground">
            {media.kind} · {formatFileSize(media.file.size)} · On this device
            only
          </p>
          <p className="mt-3 text-caption text-muted-foreground">
            This is your source media, not a generated result.
          </p>
        </section>
      )}
    </aside>
  );
}
