"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { packageErrorMessage, packageMessages, packageStatusLabel, type PackageReview, type PackageSummary } from "@/lib/video-generation-package/contract";

const stamp = (ms: number) => `${(ms / 1000).toFixed(3)}s`;
function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 space-y-1"><dt className="text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words">{children}</dd></div>;
}
function SceneSummary({ scene, summary }: { scene: PackageSummary["scenes"][number]; summary: PackageSummary }) {
  return <details className="rounded-lg border border-border bg-card/60 p-3">
    <summary className="cursor-pointer text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">
      Scene {scene.number} · {stamp(scene.startMs)}–{stamp(scene.endMs)} · {stamp(scene.durationMs)}
      <span className="mt-1 block text-xs font-normal text-muted-foreground">{scene.purpose}</span>
    </summary>
    <dl className="mt-3 space-y-3 text-xs">
      <Detail label="Scene">{scene.description}</Detail>
      <Detail label="Approved reference bindings">Character: {summary.character} · Product: {summary.product} · Location: {summary.location}</Detail>
      <Detail label="Character action and facial reactions">{scene.actions.map((action, index) => <p key={index}>
        {stamp(action.startMs)}–{stamp(action.endMs)}: {action.movement} · {action.gesture} · {action.expression}</p>)}</Detail>
      <Detail label="Product interaction">{scene.productInteraction} · {scene.productPosition}</Detail>
      <Detail label="Dialogue / narration">{scene.speech.length ? scene.speech.map((line, index) => <p key={index}>
        {line.speaker === "character" ? summary.character : "Narration"} · {stamp(line.startMs)}–{stamp(line.endMs)}: {line.text}<br />{line.delivery}</p>) : "No speech in this scene."}</Detail>
      <Detail label="Voice">{scene.voice.description} · {scene.voice.pace} · same Character voice</Detail>
      <Detail label="Camera">Shot: {scene.camera.shot} · Angle: {scene.camera.angle} · Framing: {scene.camera.framing}<br />
        Movement: {scene.camera.movement} · Zoom: {scene.camera.zoom} · Focus: {scene.camera.focus}</Detail>
      <Detail label="Lighting and atmosphere">{scene.lighting.direction} · {scene.lighting.intensity} · {scene.lighting.colors} · {scene.lighting.atmosphere}</Detail>
      <Detail label="Sound and music">Background: {scene.audio.background} · Effects: {scene.audio.effects} · Music: {scene.audio.music}</Detail>
      <Detail label="Transition">{scene.transition}</Detail>
      {scene.generationNotes && <Detail label="Additional directions">{scene.generationNotes}</Detail>}
      <Detail label="Video-generation prompt">{scene.generationPrompt}</Detail>
    </dl>
  </details>;
}
export function GenerationPackageReviewPanel({ projectId, jobId, review, eligible, enabled, available, stalled, onSaved, checkStatus }: {
  projectId: string; jobId: string; review?: PackageReview; eligible: boolean; enabled: boolean; available: boolean;
  onSaved: (review: PackageReview | undefined) => void; checkStatus: () => void;
  stalled: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const request = useRef<{ scope: string; id: string } | null>(null);
  const scope = `${projectId}:${jobId}:${review?.id ?? "new"}:${review?.version ?? 0}`;
  const currentScope = useRef(scope); currentScope.current = scope;
  async function action(action: "prepare" | "approve" | "reject" | "retry") {
    if (pending.current) return;
    pending.current = true; setBusy(action); setError(null);
    const submittedScope = scope;
    if (action === "prepare" && request.current?.scope !== scope) request.current = { scope, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/ugc/package", { method: "POST", credentials: "same-origin", redirect: "error", cache: "no-store",
        headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(60_000),
        body: JSON.stringify({ projectId, jobId, action, packageId: review?.id, version: review?.version ?? 0,
          ...(action === "prepare" ? { requestId: request.current!.id } : {}) }) });
      const result = await response.json() as { ok: boolean; generationPackage?: PackageReview; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? "Package action unavailable. Check status; saved work is preserved.");
      if (currentScope.current === submittedScope) onSaved(result.generationPackage);
    } catch (cause) {
      if (currentScope.current === submittedScope) setError(cause instanceof Error && cause.name === "Error" ? cause.message : "The response was interrupted. Check status before retrying; the same build is preserved.");
    } finally { pending.current = false; setBusy(null); checkStatus(); }
  }
  const summary = review?.summary;
  const deleted = !review || review.state === "deleted";
  const active = !!review && ["queued", "running"].includes(review.state);
  const title = review && review.state !== "deleted" ? packageStatusLabel(review) : "Generation package";
  return <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-muted/20" aria-label="Generation package review">
    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4" data-lenis-prevent tabIndex={0}>
      <div role="status" aria-live="polite" className="space-y-1">
        <h2 className="text-sm font-medium">{title}</h2>
        {review?.state === "approved" && review.current ? <p className="text-xs text-muted-foreground">Milestone 9 complete. Generating final video: Not Started. Video generation is paused.</p> :
          <p className="text-xs text-muted-foreground">Review the approved references and exact scene instructions before approving this package.</p>}
        {!available && <p className="text-xs text-warning-foreground">Package preparation needs manual migration 068.</p>}
        {!enabled && <p className="text-xs text-warning-foreground">Package preparation is disabled. Enable it in the app and local UGC worker when ready.</p>}
        {!eligible && <p className="text-xs text-warning-foreground">Approve the current Character, Product, Location and Storyboard before preparing a package.</p>}
        {review && !review.current && review.state !== "deleted" && <p className="text-xs text-warning-foreground">{packageErrorMessage("PACKAGE_INPUT_CHANGED")}</p>}
        {review?.error && <p className="text-xs text-destructive">{packageErrorMessage(review.error)}</p>}
        {stalled && <p className="text-xs text-warning-foreground">Local worker stopped responding. Restart the package-only worker to recover this same build.</p>}
        {review?.state === "queued" && <p className="text-xs text-muted-foreground">Waiting for the local worker. This same build will continue after restart.</p>}
      </div>
      {active && <ol className="space-y-1 text-xs" aria-label="Package preparation steps">
        {(["checking", "building", "validating", "saving", "review"] as const).map((phase, index, phases) => <li key={phase}
          aria-current={review.state === "running" && review.phase === phase ? "step" : undefined} className={review.state === "queued" || phases.indexOf(review.phase as typeof phase) < index ? "text-muted-foreground" : "text-foreground"}>
          {review.state === "running" && review.phase === phase ? "• " : ""}{packageMessages[phase]}</li>)}
      </ol>}
      {summary && <>
        <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
          <Detail label="Package">Version {summary.packageVersion} · {summary.title}</Detail>
          <Detail label="Duration and scenes">{stamp(summary.timeline.totalDurationMs)} · {summary.scenes.length} scene{summary.scenes.length === 1 ? "" : "s"}</Detail>
          <Detail label="Visual style / tone">{summary.visualStyle} · {summary.tone}</Detail>
          <Detail label="Aspect ratio / video type">{summary.output.aspectRatio} · {summary.videoType}</Detail>
          <Detail label="Character">{summary.character} · approved version {summary.referenceVersions.character}</Detail>
          <Detail label="Product / Prop">{summary.product} · approved version {summary.referenceVersions.product}</Detail>
          <Detail label="Location">{summary.location} · approved version {summary.referenceVersions.location}</Detail>
          <Detail label="Approved Storyboard">Revision {summary.storyboardRevision} · version {summary.storyboardVersion}</Detail>
        </dl>
        <p className="text-xs text-muted-foreground">Canonical validation passed. Provider capability matching, output format/resolution and cost confirmation belong to Milestone 10. No video request has been submitted.</p>
        <div className="space-y-2">{summary.scenes.map(scene => <SceneSummary key={scene.id} scene={scene} summary={summary} />)}</div>
      </>}
      <div className="flex flex-wrap items-center gap-2">
        {eligible && (deleted || !review.current) && <Button type="button" size="sm" disabled={!enabled || !!busy} onClick={() => void action("prepare")}>{busy === "prepare" ? "Preparing…" : "Prepare Generation Package"}</Button>}
        {review?.canApprove && <Button type="button" size="sm" disabled={!enabled || !!busy} onClick={() => void action("approve")}>{busy === "approve" ? "Approving…" : "Approve Package"}</Button>}
        {review?.canRetry && <Button type="button" size="sm" variant="outline" disabled={!enabled || !!busy} onClick={() => void action("retry")}>{busy === "retry" ? "Retrying…" : "Retry package preparation"}</Button>}
        {review?.canDelete && <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void action("reject")}>{busy === "reject" ? "Deleting…" : "Reject and Delete"}</Button>}
        <Button type="button" size="sm" variant="ghost" disabled={!!busy} onClick={checkStatus}>Check status</Button>
      </div>
      {review?.canDelete && <p className="text-xs text-muted-foreground">Reject and Delete removes the active package from review. Immutable version history is retained privately. No replacement is prepared automatically.</p>}
      {error && <p role="alert" className="break-words text-xs text-destructive">{error}</p>}
    </div>
  </section>;
}
