"use client";

import { useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { MoreHorizontal, RectangleHorizontal, RectangleVertical, Square } from "lucide-react";
import { aspectRatios, type CreationSettings } from "./creation-options";
import { popupMotion } from "@/components/ui/motion";

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
    <div className={`
      studio-aspect [&&_input:focus-visible_+_span]:[outline:2px_solid_var(--ring)]
      [&&_input:focus-visible_+_span]:[outline-offset:2px] [&&]:absolute [&&]:left-[50%] [&&]:[transform:translateX(-50%)]
      [&&]:flex [&&]:items-center [&&]:gap-[2px] [&&]:pt-[3px] [&&]:pr-[3px] [&&]:pb-[3px] [&&]:pl-[3px] [&&]:rounded-[10px]
      [&&]:[background:var(--background)] [&&]:[border:1px_solid_var(--border)] [.studio-toolbar_&&_button]:grid
      [.studio-toolbar_&&_button]:[place-items:center] [.studio-toolbar_&&_button]:pt-[0] [.studio-toolbar_&&_button]:pr-[0]
      [.studio-toolbar_&&_button]:pb-[0] [.studio-toolbar_&&_button]:pl-[0] [.studio-toolbar_&&_button]:w-[26px]
      [.studio-toolbar_&&_button]:min-h-[26px] [.studio-toolbar_&&_button]:h-[26px] [.studio-toolbar_&&_button]:[border:0]
      [.studio-toolbar_&&_button]:rounded-[6px] [.studio-toolbar_&&_button]:text-[color:var(--muted-foreground)]
      [.studio-toolbar_&&_button]:cursor-pointer [&&_button[aria-pressed='true']]:[background:var(--foreground)]
      [&&_button[aria-pressed='true']]:text-[color:var(--background)] [&&_button:hover]:[background:var(--muted)]
      [&&_button:hover]:text-[color:var(--foreground)] [&&_button[aria-pressed='true']:hover]:[background:var(--muted)]
      [&&_button[aria-pressed='true']:hover]:text-[color:var(--foreground)]
      container-max-359:[&&_button[aria-pressed='false']]:hidden
    `} role="group" aria-label="Preview aspect ratio">
      {aspectRatios.map(({ value: ratio }) => {
        const Icon = formats[ratio].icon;
        return <button key={ratio} type="button" aria-label={`${formats[ratio].label} ${ratio}`}
          aria-pressed={value === ratio} onClick={() => onChange(ratio)}><Icon aria-hidden="true" /></button>;
      })}
      <Popover.Trigger aria-label={`Aspect ratio options, current ${value}`} className={"studio-aspect-trigger [&&[data-popup-open]]:[background:var(--muted)] [&&[data-popup-open]]:text-[color:var(--foreground)]"}>
        <MoreHorizontal aria-hidden="true" />
      </Popover.Trigger>
    </div>
    <Popover.Portal>
      <Popover.Positioner side="bottom" align="center" sideOffset={8} collisionPadding={8} className={"studio-aspect-positioner [&&]:z-[70]"}>
        <Popover.Popup data-lenis-prevent className={`${popupMotion}
      studio-aspect-popup [&&]:w-[252px] [&&]:max-w-[calc(100vw_-_16px)] [&&]:pt-[12px] [&&]:pr-[12px] [&&]:pb-[12px]
      [&&]:pl-[12px] [&&]:[border:1px_solid_#dedee2] [&&]:rounded-[8px] [&&]:[background:#fff] [&&]:text-[color:#19191d]
      [&&]:[box-shadow:0_8px_24px_#0002] [&&]:[outline:none] [.dark_&&]:[background:#171717]
      [.dark_&&]:[border-color:#353535] [.dark_&&]:text-[color:#eee]
    `} initialFocus={() => document.querySelector<HTMLElement>('.studio-aspect-popup input:checked')}>
          <Popover.Title className={"studio-aspect-title [&&]:text-[length:12px] [&&]:font-[600] [&&]:mb-[12px]"}>Aspect ratio</Popover.Title>
          <fieldset className={`
      studio-aspect-grid [&&]:grid [&&]:[grid-template-columns:repeat(3,minmax(0,1fr))] [&&]:gap-[6px] [&&]:min-w-[0]
      [&&_label]:flex [&&_label]:flex-col [&&_label]:gap-[6px] [&&_label]:text-[length:11px] [&&_label]:text-[color:#6c6c73]
      [&&_label]:cursor-pointer [.dark_&&_label]:text-[color:#aaa] [&&_input:checked_+_span]:[background:var(--primary)]
      [&&_input:checked_+_span]:text-[color:var(--primary-foreground)]
      [&&_input:checked_+_span]:[border-color:var(--primary)] [&&_input:focus-visible_+_span]:[outline:2px_solid_var(--ring)]
      [&&_input:focus-visible_+_span]:[outline-offset:2px]
    `}>
            <legend className="sr-only">Choose an aspect ratio</legend>
            {aspectRatios.map(({ value: ratio }) => <label key={ratio}>
              <span>{formats[ratio].label}</span>
              <input className="sr-only" type="radio" name="studio-aspect-ratio" value={ratio} checked={value === ratio}
                onChange={() => onChange(ratio)} />
              <span className={`
      studio-aspect-choice [&&]:grid [&&]:[place-items:center] [&&]:h-[32px] [&&]:[border:1px_solid_#d7d7dc]
      [&&]:rounded-[8px] [&&]:[background:#f6f6f7] [&&]:text-[length:12px] [&&]:font-[500] [.dark_&&]:[border-color:#404040]
      [.dark_&&]:[background:#252525]
    `}>{ratio}</span>
            </label>)}
          </fieldset>
          <Popover.Close className="sr-only">Close aspect ratio options</Popover.Close>
        </Popover.Popup>
      </Popover.Positioner>
    </Popover.Portal>
  </Popover.Root>;
}
