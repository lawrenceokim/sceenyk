"use client";

import { startTransition, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteProjectAction } from "@/app/actions/projects";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export function ProjectDelete({ projectId, title }: { projectId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  async function remove() {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      const result = await deleteProjectAction({ id: projectId });
      if (result.ok) setOpen(false);
      else setError(result.message);
    } catch { setError("Your project couldn’t be deleted. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  return <Dialog open={open} onOpenChange={next => { if (!running.current) { setOpen(next); if (next) setError(""); } }}>
    <DialogTrigger render={<button type="button" className={`
      workspace-project-icon transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] motion-reduce:transition-none [&&]:flex [&&]:w-[30px] [&&]:h-[30px] [&&]:items-center [&&]:justify-center [&&]:rounded-[6px]
      [&&]:text-[color:var(--muted-foreground)] [&&]:cursor-pointer [&&_svg]:w-[14px] [&&_svg]:h-[14px]
      [&&:hover]:[background:var(--muted)] [&&:hover]:text-[color:var(--foreground)]
      [&&:focus-visible]:[outline:2px_solid_var(--ring)] [&&:focus-visible]:[outline-offset:2px]
      [@media_(pointer:_coarse)]:[&&]:min-h-[44px] [@media_(pointer:_coarse)]:[&&]:w-[44px]
    `} aria-label={`Delete ${title}`} />}><Trash2 aria-hidden="true" /></DialogTrigger>
    <DialogContent className={`
      workspace-project-rename workspace-project-delete [&&[data-slot='dialog-content']]:w-[336px]
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
      [&&_[data-slot='dialog-description']]:text-[length:12px] [&&_[data-slot='dialog-description']]:leading-[20px]
    `}>
      <DialogTitle>Delete project</DialogTitle>
      <DialogDescription>You are about to delete the project <strong className="break-words text-foreground">“{title}”</strong>. It will be removed from your saved projects.</DialogDescription>
      <form onSubmit={event => { event.preventDefault(); startTransition(async () => { await remove(); }); }}>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className={"workspace-project-rename-actions [&&]:flex [&&]:items-center [&&]:justify-end [&&]:gap-[8px] [&&]:mt-[14px]"}>
          <DialogClose render={<Button size="xs" className={"workspace-project-rename-button [.workspace-project-rename-actions_&&]:inline-flex [.workspace-project-rename-actions_&&]:items-center [.workspace-project-rename-actions_&&]:justify-center [.workspace-project-rename-actions_&&]:w-[auto] [.workspace-project-rename-actions_&&]:min-w-[64px] [.workspace-project-rename-actions_&&]:h-[28px] [.workspace-project-rename-actions_&&]:min-h-[28px] [.workspace-project-rename-actions_&&]:pt-[0] [.workspace-project-rename-actions_&&]:pr-[10px] [.workspace-project-rename-actions_&&]:pb-[0] [.workspace-project-rename-actions_&&]:pl-[10px] [.workspace-project-rename-actions_&&]:rounded-[6px] [.workspace-project-rename-actions_&&]:text-[length:11px] [.workspace-project-rename-actions_&&]:leading-[18px] [.workspace-project-rename-actions_&&]:font-[500] [@media_(pointer:_coarse)]:[.workspace-project-rename-actions_&&]:min-h-[44px]"} variant="outline" type="button" disabled={busy} autoFocus />}>Cancel</DialogClose>
          <Button size="xs" className={"workspace-project-rename-button [.workspace-project-rename-actions_&&]:inline-flex [.workspace-project-rename-actions_&&]:items-center [.workspace-project-rename-actions_&&]:justify-center [.workspace-project-rename-actions_&&]:w-[auto] [.workspace-project-rename-actions_&&]:min-w-[64px] [.workspace-project-rename-actions_&&]:h-[28px] [.workspace-project-rename-actions_&&]:min-h-[28px] [.workspace-project-rename-actions_&&]:pt-[0] [.workspace-project-rename-actions_&&]:pr-[10px] [.workspace-project-rename-actions_&&]:pb-[0] [.workspace-project-rename-actions_&&]:pl-[10px] [.workspace-project-rename-actions_&&]:rounded-[6px] [.workspace-project-rename-actions_&&]:text-[length:11px] [.workspace-project-rename-actions_&&]:leading-[18px] [.workspace-project-rename-actions_&&]:font-[500] [@media_(pointer:_coarse)]:[.workspace-project-rename-actions_&&]:min-h-[44px]"} variant="destructive" type="submit" disabled={busy}>{busy ? "Deleting…" : "Delete"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
