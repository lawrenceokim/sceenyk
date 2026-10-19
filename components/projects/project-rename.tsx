"use client";

import { useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { renameProjectAction } from "@/app/actions/projects";
import { projectTitleLimit } from "@/lib/projects/options";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import "./projects.css";

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
    <DialogTrigger render={<button type="button" className="workspace-project-icon" aria-label={`Rename ${title}`} />}><Pencil aria-hidden="true" /></DialogTrigger>
    <DialogContent className="workspace-project-rename">
      <DialogTitle>Rename project</DialogTitle>
      <DialogDescription className="sr-only">Change the name of this saved project.</DialogDescription>
      <form onSubmit={event => { event.preventDefault(); void rename(); }}>
        <label htmlFor={`rename-${projectId}`} className="sr-only">Project name</label>
        <input id={`rename-${projectId}`} className="sceenyk-field" value={value} onChange={event => setValue(event.target.value)} maxLength={projectTitleLimit} required disabled={busy} autoComplete="off" onFocus={event => event.target.select()} aria-invalid={!!error} aria-describedby={error ? `rename-error-${projectId}` : undefined} />
        {error && <p id={`rename-error-${projectId}`} role="alert" className="text-destructive">{error}</p>}
        <div className="workspace-project-rename-actions">
          <DialogClose render={<Button size="xs" className="workspace-project-rename-button" variant="outline" type="button" disabled={busy} />}>Cancel</DialogClose>
          <Button size="xs" className="workspace-project-rename-button" type="submit" disabled={busy || !value.trim() || value.trim() === title}>{busy ? "Renaming…" : "Rename"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}
