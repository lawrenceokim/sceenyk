"use client";

import { useId } from "react";
import { Check, Circle } from "lucide-react";
import { notify } from "@/lib/notifications/store";
import { videoResolutions, type VideoResolution } from "@/lib/projects/video-resolution";
import { PropertyImageGallery } from "./property-image-gallery";

// Illustrative UI previews only; these images never enter generation references.
const resolutionOptions = videoResolutions.map(value => ({ value, label: value, image: `/images/resolutions/${value}.webp` }));

export function StudioResolution({ value, onChange, imageCards = false, readOnly = false }: {
  value: VideoResolution;
  onChange: (value: VideoResolution) => void;
  imageCards?: boolean;
  readOnly?: boolean;
}) {
  const id = useId();
  const unavailable = (resolution: VideoResolution) => notify(resolution !== "480p"
    ? `${resolution} is disabled for now and can’t be selected. Current testing supports 480p only.`
    : "This project’s saved resolution is read-only. Approved settings are preserved; unresolved approval status must be checked first.", "info");
  if (imageCards) return <div className="min-w-0 space-y-3">
    <PropertyImageGallery label="Video resolution" value={value} options={resolutionOptions.map(option => ({ ...option, disabled: readOnly || option.value !== "480p" }))} onChange={next => { if (!readOnly && next === "480p") onChange(next); }} descriptionId={id} onDisabledOption={unavailable} />
    <p id={id} className="sr-only">Current testing supports 480p. Approved saved settings are preserved.</p>
  </div>;
  return <fieldset aria-describedby={id} className="@container/resolution min-w-0 space-y-3 rounded-xl border border-border bg-card/40 p-3">
    <legend className="sr-only">Video resolution</legend>
    <div className="grid min-w-0 grid-cols-3 gap-2">
      {videoResolutions.map(resolution => <div key={resolution} className="relative min-w-0"><label className="relative block min-w-0 cursor-pointer">
        <input type="radio" name={id} value={resolution} checked={value === resolution} disabled={readOnly || resolution !== "480p"} onChange={() => { if (!readOnly && resolution === "480p") onChange(resolution); }} className="peer sr-only" />
        <span className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-border px-1 py-2 text-xs font-medium text-muted-foreground transition-colors @min-[14rem]/resolution:flex-row peer-checked:border-primary peer-checked:bg-primary/15 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background motion-reduce:transition-none peer-disabled:opacity-45">
          {value === resolution ? <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" aria-hidden="true" /></span> : <Circle className="size-4 shrink-0" aria-hidden="true" />}
          {resolution}
        </span>
      </label>{(readOnly || resolution !== "480p") && <button type="button" aria-disabled="true" aria-label={`${resolution} unavailable`}
        className="absolute inset-0 cursor-not-allowed rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" onClick={() => unavailable(resolution)} />}</div>)}
    </div>
    <p id={id} className="sr-only">Current testing supports 480p. Approved saved settings are preserved.</p>
  </fieldset>;
}
