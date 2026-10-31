"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ReferenceRegenerationDialog({ kind, busy, blocked, error, onCancel, onContinue }: {
  kind: "character" | "product" | null; busy: boolean; blocked: boolean; error: string; onCancel: () => void; onContinue: () => void;
}) {
  const subject = kind === "product" ? "Product" : "Character";
  return <Dialog open={kind !== null} onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <DialogContent showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>Regenerate {subject} Sheet?</DialogTitle>
        <DialogDescription>Regenerating will permanently delete the current {subject} Sheet and generate a new one. This action cannot be undone.</DialogDescription>
      </DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <DialogFooter>
        <Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || blocked} onClick={onContinue}>Continue</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
