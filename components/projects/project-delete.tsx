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
    <DialogTrigger render={<button type="button" className="workspace-project-icon" aria-label={`Delete ${title}`} />}><Trash2 aria-hidden="true" /></DialogTrigger>
    <DialogContent className="workspace-project-rename workspace-project-delete">
      <DialogTitle>Delete project</DialogTitle>
      <DialogDescription>You are about to delete the project <strong className="break-words text-foreground">“{title}”</strong>. It will be removed from your saved projects.</DialogDescription>
      <form onSubmit={event => { event.preventDefault(); startTransition(async () => { await remove(); }); }}>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <div className="workspace-project-rename-actions">
          <DialogClose render={<Button size="xs" className="workspace-project-rename-button" variant="outline" type="button" disabled={busy} autoFocus />}>Cancel</DialogClose>
          <Button size="xs" className="workspace-project-rename-button" variant="destructive" type="submit" disabled={busy}>{busy ? "Deleting…" : "Delete"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
