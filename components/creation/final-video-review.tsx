"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { FinalAvailability } from "@/lib/final-video-generation/contract";

export function FinalVideoReview({ projectId, jobId, packageId, value, checkStatus, onSaved }: {
  projectId: string; jobId: string; packageId?: string; value?: FinalAvailability;
  checkStatus: () => void; onSaved: (value: FinalAvailability) => void;
}) {
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState<string | null>(null);
  const requestId = useRef<string | null>(null); const review = value?.review;
  async function act(action: "generate" | "approve" | "reject" | "recover") {
    setBusy(true); setMessage(null);
    if (action === "generate") requestId.current ??= crypto.randomUUID();
    try {
      const response = await fetch("/api/ugc/final-video", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, jobId, action, version: review?.version ?? 0,
          ...(review ? { executionId: review.id } : {}),
          ...(action === "generate" ? { packageId, requestId: requestId.current, authorizationVersion: value?.authorization?.version, acceptedCost: true } : {}) }) });
      const body = await response.json();
      if (!response.ok || !body.ok || !body.finalVideo) throw new Error(typeof body.message === "string" ? body.message : "Video action unavailable.");
      onSaved(body.finalVideo); if (action === "generate") requestId.current = null; checkStatus();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Check status before continuing."); }
    finally { setBusy(false); }
  }
  const preview = review ? `/api/ugc/final-video/preview?${new URLSearchParams({ projectId, jobId, executionId: review.id })}` : "";
  const canGenerate = !!packageId && !!value?.eligible && !!value.authorization && (!review || review.state === "deleted");
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-border bg-card p-4">
    <div><h3 className="text-sm font-semibold text-foreground">Final Video</h3>
      <p className="mt-1 text-sm text-muted-foreground" role="status" aria-live="polite">{review?.label ?? "Generate your final video from the approved package."}</p></div>
    {review && !review.current && review.state !== "deleted" && <p className="text-sm text-destructive">The approved package changed. This result cannot be approved as current.</p>}
    {review && ["review", "approved"].includes(review.state) && <>
      <video key={`${review.id}:${review.revision}`} className="max-h-[60dvh] w-full rounded-md bg-black object-contain" controls playsInline preload="metadata" src={preview} aria-label="Private final video preview" />
      <p className="text-xs text-muted-foreground">{((review.durationMs ?? 0) / 1000).toFixed(2)}s · {review.aspectRatio} · {review.width} × {review.height}</p>
    </>}
    {review?.error && <p className="text-sm text-destructive">Generation stopped safely. Saved scenes and audio are preserved. {review.phase === "reconciliation_required" ? "Recovery will retrieve known results without submitting another paid request." : "Check local diagnostics for the failed stage."}</p>}
    {canGenerate && value?.authorization && <p className="text-xs text-muted-foreground">Operator-funded development generation. Authorized estimated budget: ${(value.authorization.maxEstimatedCostMicrousd / 1_000_000).toFixed(2)} · Voice language: {value.authorization.language}. Generate Final Video confirms this funding authorization.</p>}
    {!value?.available && <p className="text-sm text-muted-foreground">Final video generation requires local setup.</p>}
    {value?.available && !value.enabled && <p className="text-sm text-muted-foreground">Final video generation is not enabled for this local session.</p>}
    {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
    <div className="flex flex-wrap gap-2">
      {canGenerate && <Button size="sm" disabled={busy} onClick={() => void act("generate")}>{busy ? "Starting…" : "Generate Final Video"}</Button>}
      {review?.canApprove && <Button size="sm" disabled={busy} onClick={() => void act("approve")}>Approve Final Video</Button>}
      {review?.canReject && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("reject")}>Reject and Delete Final Video</Button>}
      {review?.canRecover && value?.enabled && <Button size="sm" variant="outline" disabled={busy} onClick={() => void act("recover")}>Recover saved work</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={checkStatus}>Check status</Button>
    </div>
  </section>;
}
