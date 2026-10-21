"use client";

import { startTransition, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteTemplateAction } from "@/app/actions/marketplace";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";

export function TemplateDelete({ listingId, title }: { listingId: string; title: string }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  async function remove() {
    if (running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      const result = await deleteTemplateAction({ id: listingId });
      if (result.ok) setOpen(false);
      else setError(result.message);
    } catch { setError("Your template couldn’t be deleted. Please try again."); }
    finally { running.current = false; setBusy(false); }
  }
  const actionClass = "h-7 min-h-7 min-w-16 rounded-md px-2.5 text-[11px] leading-[18px] [@media(pointer:coarse)]:min-h-11";
  return <Dialog open={open} onOpenChange={next => { if (!running.current) { setOpen(next); if (next) setError(""); } }}>
    <DialogTrigger render={<button type="button" aria-label={`Delete ${title}`} title="Delete template"
      className="flex size-[30px] cursor-pointer items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:size-11" />}>
      <Trash2 className="size-3.5" aria-hidden="true" />
    </DialogTrigger>
    <DialogContent className="w-[336px] max-w-[calc(100%_-_32px)] gap-3.5 rounded-[13px] p-5 shadow-none [&_[data-slot=dialog-title]]:text-sm [&_[data-slot=dialog-title]]:leading-5 [&_[data-slot=dialog-description]]:text-xs [&_[data-slot=dialog-description]]:leading-5">
      <DialogTitle>Delete template</DialogTitle>
      <DialogDescription>Are you sure you want to delete <strong className="break-words text-foreground">“{title}”</strong>? It will be removed from My Templates and Marketplace. Your original project will be kept.</DialogDescription>
      <form onSubmit={event => { event.preventDefault(); startTransition(async () => { await remove(); }); }}>
        {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
        <div className="mt-3.5 flex items-center justify-end gap-2">
          <DialogClose render={<Button size="xs" className={actionClass} variant="outline" type="button" disabled={busy} autoFocus />}>Cancel</DialogClose>
          <Button size="xs" className={actionClass} variant="destructive" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Deleting…" : "Delete"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
