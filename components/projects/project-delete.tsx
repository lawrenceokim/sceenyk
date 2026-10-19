"use client";

import { Trash2 } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";

// No project deletion service/confirmation exists, and the current DB grants
// prohibit deletes. Keep that limitation explicit rather than inventing a flow.
export function ProjectDeleteUnavailable({ title }: { title: string }) {
  return <Tooltip.Root>
    <Tooltip.Trigger render={<button type="button" className="workspace-project-icon" aria-disabled="true" aria-label={`Delete ${title} (unavailable)`} onClick={event => { event.preventDefault(); event.stopPropagation(); }} />}>
      <Trash2 aria-hidden="true" />
    </Tooltip.Trigger>
    <Tooltip.Portal><Tooltip.Positioner side="bottom" sideOffset={6} className="z-[70]">
      <Tooltip.Popup className="rounded-md border border-border bg-popover px-2 py-1 text-caption text-popover-foreground">Project deletion is not available.</Tooltip.Popup>
    </Tooltip.Positioner></Tooltip.Portal>
  </Tooltip.Root>;
}
