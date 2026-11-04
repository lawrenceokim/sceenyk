"use client";

import { useId } from "react";
import { Check, Circle, Info } from "lucide-react";
import { videoResolutions, type VideoResolution } from "@/lib/projects/video-resolution";

export function StudioResolution({ value, onChange }: { value: VideoResolution; onChange: (value: VideoResolution) => void }) {
  const id = useId();
  return <fieldset aria-describedby={id} className="@container/resolution min-w-0 space-y-3 rounded-xl border border-border bg-card/40 p-3">
    <legend className="sr-only">Video resolution</legend>
    <div className="grid min-w-0 grid-cols-3 gap-2">
      {videoResolutions.map(resolution => <label key={resolution} className="relative min-w-0 cursor-pointer">
        <input type="radio" name={id} value={resolution} checked={value === resolution} onChange={() => onChange(resolution)} className="peer sr-only" />
        <span className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-border px-1 py-2 text-xs font-medium text-muted-foreground transition-colors @min-[14rem]/resolution:flex-row peer-checked:border-primary peer-checked:bg-primary/15 peer-checked:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background motion-reduce:transition-none">
          {value === resolution ? <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-3" aria-hidden="true" /></span> : <Circle className="size-4 shrink-0" aria-hidden="true" />}
          {resolution}
        </span>
      </label>)}
    </div>
    <p id={id} className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Higher resolutions may take longer to generate.</p>
  </fieldset>;
}
