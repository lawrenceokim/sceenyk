"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { MoreHorizontal, RectangleHorizontal, RectangleVertical, Square } from "lucide-react";
import { aspectRatios, type CreationSettings } from "./creation-options";

const formats = {
  "1:1": { label: "Square", icon: Square },
  "16:9": { label: "Landscape", icon: RectangleHorizontal },
  "9:16": { label: "Portrait", icon: RectangleVertical },
};

export function StudioAspectControl({ value, onChange }: {
  value: CreationSettings["aspectRatio"];
  onChange: (value: CreationSettings["aspectRatio"]) => void;
}) {
  const [open, setOpen] = useState(false);
  return <Popover.Root open={open} onOpenChange={setOpen}>
    <div className="studio-aspect" role="group" aria-label="Preview aspect ratio">
      {aspectRatios.map(({ value: ratio }) => {
        const Icon = formats[ratio].icon;
        return <button key={ratio} type="button" aria-label={`${formats[ratio].label} ${ratio}`}
          aria-pressed={value === ratio} onClick={() => onChange(ratio)}><Icon aria-hidden="true" /></button>;
      })}
      <Popover.Trigger aria-label={`Aspect ratio options, current ${value}`} className="studio-aspect-trigger">
        <MoreHorizontal aria-hidden="true" />
      </Popover.Trigger>
    </div>
    <Popover.Portal>
      <Popover.Positioner side="bottom" align="center" sideOffset={8} collisionPadding={8} className="studio-aspect-positioner">
        <Popover.Popup className="studio-aspect-popup" initialFocus={() => document.querySelector<HTMLElement>('.studio-aspect-popup input:checked')}>
          <Popover.Title className="studio-aspect-title">Aspect ratio</Popover.Title>
          <fieldset className="studio-aspect-grid">
            <legend className="sr-only">Choose an aspect ratio</legend>
            {aspectRatios.map(({ value: ratio }) => <label key={ratio}>
              <span>{formats[ratio].label}</span>
              <input className="sr-only" type="radio" name="studio-aspect-ratio" value={ratio} checked={value === ratio}
                onChange={() => onChange(ratio)} />
              <span className="studio-aspect-choice">{ratio}</span>
            </label>)}
          </fieldset>
          <Popover.Close className="sr-only">Close aspect ratio options</Popover.Close>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
