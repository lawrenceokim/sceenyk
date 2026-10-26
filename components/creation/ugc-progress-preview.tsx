"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, LoaderCircle, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isUgcJobActive, shouldPollUgcProgress, ugcWorkerStaleMilliseconds, type UgcProgressStep } from "@/lib/ugc-jobs/contract";
import { ugcProcessingMilliseconds, ugcStageExpectation } from "@/lib/ugc-jobs/progress";
import type { useUgcProgress } from "./use-ugc-progress";
import { v5ManualReviewProgress } from "@/lib/character-v5/progress";

export type UgcProgressState = ReturnType<typeof useUgcProgress>;

function StepIcon({ state }: { state: UgcProgressStep["state"] }) {
  const Icon = state === "completed" ? CheckCircle2 : state === "active" ? LoaderCircle :
    state === "failed" ? XCircle : state === "paused" ? TriangleAlert : Circle;
  return <Icon aria-hidden="true" className={`size-3.5 shrink-0 ${
    state === "completed" ? "text-success-foreground" : state === "active" ? "text-primary motion-safe:animate-spin" :
    state === "failed" ? "text-destructive" : state === "paused" ? "text-warning-foreground" : "text-muted-foreground/60"
  }`} />;
}

function elapsedTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function UgcProgressPreview({ progress }: { progress: UgcProgressState }) {
  const { job, loading, error, checkStatus, receivedAt } = progress;
  const [clock, setClock] = useState(() => Date.now());
  const active = !!job && (isUgcJobActive(job.status) || !!job.referenceReview?.regenerating);
  const location = job?.currentStage === "location_reference" ? job.location : undefined;
  const locationRunning = !!location && ["running_plan", "running_image", "rejecting"].includes(location.state) && !!location.leaseExpiresAt;
  const manualReview = job?.currentStage === "character_reference" && !["failed", "cancelled", "completed"].includes(job.status) ?
    v5ManualReviewProgress(job.referenceReview?.characterV5) : null;
  const regeneration = job && !["completed", "cancelled"].includes(job.status) ?
    job.referenceReview?.groups.find(group => group.sheetInvalidated && job.currentStage === `${group.type}_reference`) : undefined;
  const ticking = !!job && shouldPollUgcProgress(job) && (locationRunning || job.status === "running" || !!job.referenceReview?.regenerating);
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [ticking]);
  // Correct local clock skew using the server observation; timestamps remain
  // authoritative. A display tick can never complete or advance any step.
  const now = job ? Date.parse(job.serverNow) + Math.max(0, clock - receivedAt) : clock;
  const stalled = !manualReview && !!job && (locationRunning || job.status === "running" || !!job.referenceReview?.regenerating || regeneration?.execution?.state === "stalled") && (job.worker.state === "stalled" ||
    !job.worker.heartbeatAt || !job.worker.leaseExpiresAt ||
    now - Date.parse(job.worker.heartbeatAt) >= ugcWorkerStaleMilliseconds || Date.parse(job.worker.leaseExpiresAt) <= now);
  const paused = stalled || job?.paused || job?.status === "awaiting_confirmation";
  const characterCompletePause = !!job?.paused && job.stage === "product_reference" &&
    job.steps.some(step => step.id === "character_reference" && step.state === "completed");
  const productCompletePause = !!job?.paused && job.stage === "location_reference" &&
    job.steps.some(step => step.id === "product_reference" && step.state === "completed");
  const title = loading ? "Checking generation status" : !job ? "Generation status unavailable" :
    location ? location.state === "approved" ? "Location approved" : location.state === "failed" ? "Location stopped safely" :
      stalled ? "Waiting for generation worker" : job.message.split(".")[0] :
    manualReview ? manualReview.title : regeneration?.state === "failed" ? "Reference regeneration stopped" : stalled ? "Waiting for generation worker" :
    job.referenceReview?.regenerating ? "Regenerating reference" : regeneration ? "Waiting for generation worker" :
    job.status === "failed" ? "Generation stopped" : job.status === "cancelled" ? "Generation cancelled" :
    job.status === "completed" ? "Generation complete" : productCompletePause ? "Product reference complete" : characterCompletePause ? "Character reference complete" : paused ? "Generation paused" : "Creating your video";
  const processingMs = job ? ugcProcessingMilliseconds(job, now) : null;
  const expectation = job && !paused && active ? ugcStageExpectation(job.currentStage) : null;

  return <div aria-label="Creation preview" className="min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-muted/20">
    <div className="h-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4" data-lenis-prevent tabIndex={0} role="region" aria-label="Generation progress">
      <section className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center gap-3 text-xs">
        <div role="status" aria-live="polite" className="space-y-1">
          <h2 className="flex items-center gap-2 text-sm font-medium">
            {(stalled || paused) && <TriangleAlert className="size-4 shrink-0 text-warning-foreground" aria-hidden="true" />}
            {job?.status === "failed" && <XCircle className="size-4 shrink-0 text-destructive" aria-hidden="true" />}
            {title}
          </h2>
          {job?.referenceReview?.characterV5?.errorPhase && <p className="break-words text-destructive">Character technical phase: {job.referenceReview.characterV5.errorPhase} · {job.referenceReview.characterV5.errorCode}</p>}
          {(characterCompletePause || productCompletePause) && <p className="text-warning-foreground">Generation paused</p>}
          <p key={`${job?.status}:${job?.message}:${stalled}`} className="break-words text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
            {loading ? "Reading your saved workflow." : manualReview ? manualReview.message : stalled ? "The generation worker may no longer be running. Start the local UGC worker to resume saved work." : job?.message ?? "Check status to reconnect to your saved workflow."}
          </p>
          {job?.status === "failed" && <p className="text-destructive">Failed at: {job.stageLabel}</p>}
        </div>
        {job && <ol className="space-y-1" aria-label="Video workflow">
          {job.steps.map(step => {
            const state = step.state === "active" && paused ? "paused" : step.state;
            return <li key={step.id} className="min-w-0">
              <div aria-current={state === "active" || state === "failed" || state === "paused" ? "step" : undefined}
                className={`flex min-w-0 items-center gap-2 leading-5 transition-colors duration-200 motion-reduce:transition-none ${state === "waiting" ? "text-muted-foreground" : "text-foreground"}`}>
                <StepIcon state={state} /><span className="min-w-0 break-words">{step.label}<span className="sr-only"> — {state}</span></span>
              </div>
              {step.id === "location_reference" && !!job.locationSteps?.length && <ol className="my-1 ml-1.5 space-y-1 border-l border-border pl-4" aria-label="Location reference steps">
                {job.locationSteps.map(item => <li key={item.id} aria-current={item.state === "active" ? "step" : undefined} className="flex items-center gap-2 text-muted-foreground">
                  <StepIcon state={item.state} /><span>{item.label}<span className="sr-only"> — {item.state}</span></span>
                </li>)}
              </ol>}
              {((step.id === "character_reference" && job.characterSteps.length > 0 &&
                (job.currentStage === "character_reference" || job.currentStage === "product_reference" || productCompletePause)) ||
                (step.id === "product_reference" && (job.productSteps?.length ?? 0) > 0 &&
                (job.currentStage === "product_reference" || productCompletePause))) && <ol className="my-1 ml-1.5 space-y-0.5 border-l border-border py-1 pl-4" aria-label={step.id === "product_reference" ? "Product reference steps" : "Character reference steps"}>
                {(step.id === "product_reference" ? job.productSteps : job.characterSteps).map(substep => {
                  const substate = substep.state === "active" && paused ? "paused" : substep.state;
                  return <li key={substep.id} aria-current={substate === "active" ? "step" : undefined}
                    className="flex min-w-0 items-center gap-2 leading-5 text-muted-foreground transition-colors duration-200 motion-reduce:transition-none">
                    <StepIcon state={substate} /><span className="min-w-0 break-words">{substep.label}
                      {substate === "failed" ? " — failed" : substate === "active" ? substep.id === "sheet" ? " — building" : " — generating" : <span className="sr-only"> — {substate}</span>}
                    </span>
                  </li>;
                })}
              </ol>}
            </li>;
          })}
        </ol>}
        {job && job.events.some(event => event.type.includes("slot_validation") || event.type.includes("regeneration") || event.type.includes("recovery_") || event.type.includes("sheet_rebuild") || event.type.endsWith("ready_for_review")) &&
          <details className="rounded-md border border-border px-2.5 py-2" open={!!regeneration}>
            <summary className="cursor-pointer text-xs font-medium">Reference regeneration history</summary>
            <ol className="mt-2 space-y-1.5 text-[11px] text-muted-foreground" aria-label="Saved regeneration events">
              {job.events.filter(event => event.type === "reference_regeneration_requested" && !job.events.some(item => item.type.endsWith(".regeneration_requested")) || /^(character|product)_reference\./.test(event.type) &&
                (event.type.includes("slot_validation") || event.type.includes("regeneration") || event.type.includes("recovery_") || event.type.includes("sheet_rebuild") || event.type.endsWith("ready_for_review") ||
                  job.events.some(item => item.type.startsWith(event.type.split(".")[0]) && item.type.includes("regeneration")))).map(event =>
                <li key={event.id} className="break-words"><time dateTime={event.at} className="mr-1.5 tabular-nums">{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
                  {event.view ? `${event.view.charAt(0).toUpperCase()}${event.view.slice(1)} · ` : ""}{event.message}</li>)}
            </ol>
          </details>}
        {expectation && <p className="break-words text-muted-foreground">{expectation}</p>}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-muted-foreground">
          {job?.startedAt && <p className="tabular-nums">{processingMs === null ? "Started earlier" : `${job.timing.scope === "regeneration" ? "Regeneration elapsed" : "Elapsed"}: ${elapsedTime(processingMs)}`}</p>}
          {job && !job.startedAt && <p>Waiting to start</p>}
          {(job && (active || !!regeneration) || error) && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={checkStatus}>Check status</Button>}
        </div>
        {error && job && <p role="status" className="break-words text-warning-foreground">Unable to refresh generation status. Showing the last saved progress.</p>}
      </section>
    </div>
  </div>;
}
