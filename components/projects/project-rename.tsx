"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { renameProjectAction } from "@/app/actions/projects";
import { projectTitleLimit } from "@/lib/projects/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export function ProjectRename({ projectId, title }: { projectId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(title);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  async function rename() {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      const result = await renameProjectAction({ id: projectId, title: value });
      if (result.ok) setOpen(false);
      else setError(result.message);
    } catch { setError("Your project couldn’t be renamed. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={next => { if (!running.current) { setOpen(next); if (next) { setValue(title); setError(""); } } }}>
    <DialogTrigger render={<button type="button" className={`
      workspace-project-icon [&&]:flex [&&]:w-[30px] [&&]:h-[30px] [&&]:items-center [&&]:justify-center [&&]:rounded-[6px]
      [&&]:text-[color:var(--muted-foreground)] [&&]:cursor-pointer [&&_svg]:w-[14px] [&&_svg]:h-[14px]
      [&&:hover]:[background:var(--muted)] [&&:hover]:text-[color:var(--foreground)]
      [&&:focus-visible]:[outline:2px_solid_var(--ring)] [&&:focus-visible]:[outline-offset:2px]
      [@media_(pointer:_coarse)]:[&&]:min-h-[44px] [@media_(pointer:_coarse)]:[&&]:w-[44px]
    `} aria-label={`Rename ${title}`} />}><Pencil aria-hidden="true" /></DialogTrigger>
    <DialogContent className={`
      workspace-project-rename [&&[data-slot='dialog-content']]:w-[336px]
      [&&[data-slot='dialog-content']]:max-w-[calc(100%_-_32px)] [&&[data-slot='dialog-content']]:pt-[20px]
      [&&[data-slot='dialog-content']]:pr-[20px] [&&[data-slot='dialog-content']]:pb-[20px]
      [&&[data-slot='dialog-content']]:pl-[20px] [&&[data-slot='dialog-content']]:gap-[14px]
      [&&[data-slot='dialog-content']]:rounded-[13px] [&&[data-slot='dialog-content']]:[box-shadow:none]
      [&&_[data-slot='dialog-title']]:text-[length:14px] [&&_[data-slot='dialog-title']]:leading-[20px]
      [&&_[data-slot='dialog-title']]:font-[600] [&&_form_>_p]:mt-[8px] [&&_form_>_p]:text-[length:12px]
      [&&_>_[data-slot='dialog-close']]:w-[28px] [&&_>_[data-slot='dialog-close']]:h-[28px]
      [&&_>_[data-slot='dialog-close']_svg]:w-[12px] [&&_>_[data-slot='dialog-close']_svg]:h-[12px]
      [@media_(pointer:_coarse)]:[&&_>_[data-slot='dialog-close']]:w-[44px]
      [@media_(pointer:_coarse)]:[&&_>_[data-slot='dialog-close']]:h-[44px]
      [@media_(pointer:_coarse)]:[&&_>_[data-slot='dialog-close']]:top-[0]
      [@media_(pointer:_coarse)]:[&&_>_[data-slot='dialog-close']]:right-[0]
    `}>
      <DialogTitle>Rename project</DialogTitle>
      <DialogDescription className="sr-only">Change the name of this saved project.</DialogDescription>
      <form onSubmit={event => { event.preventDefault(); void rename(); }}>
        <label htmlFor={`rename-${projectId}`} className="sr-only">Project name</label>
        <input id={`rename-${projectId}`} className={`
      [@layer_components]:w-[100%] [@layer_components]:min-h-[var(--control-height)]
      [@layer_components]:[border:1px_solid_var(--input)] [@layer_components]:rounded-[var(--radius-md)]
      [@layer_components]:pt-[var(--space-3)] [@layer_components]:pr-[var(--space-4)] [@layer_components]:pb-[var(--space-3)]
      [@layer_components]:pl-[var(--space-4)] [@layer_components]:[background:var(--field)]
      [@layer_components]:text-[color:var(--foreground)]
      [@layer_components]:[transition:border-color_var(--duration-fast),_box-shadow_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] sceenyk-field
      [@layer_components]:[&::placeholder]:text-[color:var(--muted-foreground)]
      [@layer_components]:[&::placeholder]:opacity-[1] [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:2px]
      [@layer_components]:[&:focus-visible]:[border-color:var(--ring)]
      [@layer_components]:[&:focus-visible]:[box-shadow:var(--focus-shadow)]
      [@layer_components]:[&[aria-invalid='true']]:[border-color:var(--destructive)]
      [@layer_components]:[&[aria-invalid='true']:focus-visible]:[outline-color:var(--destructive)]
      [@layer_components]:[&[aria-invalid='true']:focus-visible]:[box-shadow:0_0_0_3px_color-mix(in_srgb,_var(--destructive)_24%,_transparent)]
      [@layer_components]:[&:disabled]:opacity-[0.5] [@layer_components]:[&:disabled]:cursor-not-allowed
      [.workspace-marketplace-search_&&]:min-h-[32px] [.workspace-marketplace-search_&&]:h-[32px]
      [.workspace-marketplace-search_&&]:pt-[4px] [.workspace-marketplace-search_&&]:pb-[4px]
      [.workspace-marketplace-search_&&]:text-[length:12px] [.workspace-marketplace-search_&&]:rounded-[16px]
      [.workspace-doc-picker_&&]:w-[100%] [.workspace-doc-picker_&&]:h-[36px] [.workspace-doc-picker_&&]:min-h-[36px]
      [.workspace-doc-picker_&&]:pt-[6px] [.workspace-doc-picker_&&]:pb-[6px]
      [.workspace-doc-picker_&&]:rounded-[var(--ui-radius-control)] [.workspace-doc-picker_&&]:text-[length:13px]
      [@media_(pointer:_coarse)]:[.workspace-doc-picker_&&]:h-[44px]
      [@media_(pointer:_coarse)]:[.workspace-doc-picker_&&]:min-h-[44px] [.workspace-project-rename_&&]:h-[36px]
      [.workspace-project-rename_&&]:min-h-[36px] [.workspace-project-rename_&&]:pt-[6px]
      [.workspace-project-rename_&&]:pr-[8px] [.workspace-project-rename_&&]:pb-[6px] [.workspace-project-rename_&&]:pl-[8px]
      [.workspace-project-rename_&&]:rounded-[7px] [.workspace-project-rename_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-project-rename_&&]:min-h-[44px] [.workspace-settings-inner_textarea&&]:h-[auto]
      [.workspace-settings-inner_textarea&&]:min-h-[96px] [.workspace-settings-inner_textarea&&]:pt-[8px]
      [.workspace-settings-inner_textarea&&]:pr-[8px] [.workspace-settings-inner_textarea&&]:pb-[8px]
      [.workspace-settings-inner_textarea&&]:pl-[8px] [.workspace-settings-inner_textarea&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-picker_&&]:min-h-[44px]
      [.studio-property_&&]:min-h-[var(--workspace-control-height)] [.studio-property_&&]:rounded-[var(--ui-radius-control)]
      [.studio-property_&&]:pt-[6px] [.studio-property_&&]:pr-[8px] [.studio-property_&&]:pb-[6px]
      [.studio-property_&&]:pl-[8px] [.studio-property_&&]:text-[length:var(--ui-text-control)]
      [.studio-property_&&]:leading-[18px] [.studio-property_textarea&&]:min-h-[112px]
      [.studio-property_textarea&&]:pt-[var(--ui-space-3)] [.studio-property_textarea&&]:pr-[var(--ui-space-3)]
      [.studio-property_textarea&&]:pb-[var(--ui-space-3)] [.studio-property_textarea&&]:pl-[var(--ui-space-3)]
      [.studio-property_textarea&&]:text-[length:13px] [.studio-property_textarea&&]:leading-[20px]
      [.studio-setting-select_select&&]:pr-[28px]
    `} value={value} onChange={event => setValue(event.target.value)} maxLength={projectTitleLimit} required disabled={busy} autoComplete="off" onFocus={event => event.target.select()} aria-invalid={!!error} aria-describedby={error ? `rename-error-${projectId}` : undefined} />
        {error && <p id={`rename-error-${projectId}`} role="alert" className="text-destructive">{error}</p>}
        <div className={"workspace-project-rename-actions [&&]:flex [&&]:items-center [&&]:justify-end [&&]:gap-[8px] [&&]:mt-[14px]"}>
          <DialogClose render={<Button size="xs" className={"workspace-project-rename-button [.workspace-project-rename-actions_&&]:inline-flex [.workspace-project-rename-actions_&&]:items-center [.workspace-project-rename-actions_&&]:justify-center [.workspace-project-rename-actions_&&]:w-[auto] [.workspace-project-rename-actions_&&]:min-w-[64px] [.workspace-project-rename-actions_&&]:h-[28px] [.workspace-project-rename-actions_&&]:min-h-[28px] [.workspace-project-rename-actions_&&]:pt-[0] [.workspace-project-rename-actions_&&]:pr-[10px] [.workspace-project-rename-actions_&&]:pb-[0] [.workspace-project-rename-actions_&&]:pl-[10px] [.workspace-project-rename-actions_&&]:rounded-[6px] [.workspace-project-rename-actions_&&]:text-[length:11px] [.workspace-project-rename-actions_&&]:leading-[18px] [.workspace-project-rename-actions_&&]:font-[500] [@media_(pointer:_coarse)]:[.workspace-project-rename-actions_&&]:min-h-[44px]"} variant="outline" type="button" disabled={busy} />}>Cancel</DialogClose>
          <Button size="xs" className={"workspace-project-rename-button [.workspace-project-rename-actions_&&]:inline-flex [.workspace-project-rename-actions_&&]:items-center [.workspace-project-rename-actions_&&]:justify-center [.workspace-project-rename-actions_&&]:w-[auto] [.workspace-project-rename-actions_&&]:min-w-[64px] [.workspace-project-rename-actions_&&]:h-[28px] [.workspace-project-rename-actions_&&]:min-h-[28px] [.workspace-project-rename-actions_&&]:pt-[0] [.workspace-project-rename-actions_&&]:pr-[10px] [.workspace-project-rename-actions_&&]:pb-[0] [.workspace-project-rename-actions_&&]:pl-[10px] [.workspace-project-rename-actions_&&]:rounded-[6px] [.workspace-project-rename-actions_&&]:text-[length:11px] [.workspace-project-rename-actions_&&]:leading-[18px] [.workspace-project-rename-actions_&&]:font-[500] [@media_(pointer:_coarse)]:[.workspace-project-rename-actions_&&]:min-h-[44px]"} type="submit" disabled={busy || !value.trim() || value.trim() === title}>{busy ? "Renaming…" : "Rename"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
