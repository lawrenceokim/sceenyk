"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, LoaderCircle, TriangleAlert, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isUgcJobActive, shouldPollUgcProgress, ugcWorkerStaleMilliseconds, type UgcProgressStep } from "@/lib/ugc-jobs/contract";
import { ugcProcessingMilliseconds, ugcStageExpectation } from "@/lib/ugc-jobs/progress";
import type { useUgcProgress } from "./use-ugc-progress";

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
  const active = !!job && isUgcJobActive(job.status);
  const ticking = !!job && shouldPollUgcProgress(job) && job.status === "running";
  useEffect(() => {
    if (!ticking) return;
    const timer = setInterval(() => setClock(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [ticking]);
  // Correct local clock skew using the server observation; timestamps remain
  // authoritative. A display tick can never complete or advance any step.
  const now = job ? Date.parse(job.serverNow) + Math.max(0, clock - receivedAt) : clock;
  const stalled = job?.status === "running" && (job.worker.state === "stalled" ||
    !job.worker.heartbeatAt || !job.worker.leaseExpiresAt ||
    now - Date.parse(job.worker.heartbeatAt) >= ugcWorkerStaleMilliseconds || Date.parse(job.worker.leaseExpiresAt) <= now);
  const paused = stalled || job?.paused || job?.status === "awaiting_confirmation";
  const characterCompletePause = !!job?.paused && job.stage === "product_reference" &&
    job.steps.some(step => step.id === "character_reference" && step.state === "completed");
  const productCompletePause = !!job?.paused && job.stage === "location_reference" &&
    job.steps.some(step => step.id === "product_reference" && step.state === "completed");
  if (job?.status === "completed") return null;
  const title = loading ? "Checking generation status" : !job ? "Generation status unavailable" :
    job.status === "failed" ? "Generation stopped" : job.status === "cancelled" ? "Generation cancelled" :
    job.referenceReview?.regenerating ? "Regenerating reference" : productCompletePause ? "Product reference complete" : characterCompletePause ? "Character reference complete" : stalled ? "Generation appears paused" : paused ? "Generation paused" : "Creating your video";
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
          {(characterCompletePause || productCompletePause) && <p className="text-warning-foreground">Generation paused</p>}
          <p key={`${job?.status}:${job?.message}:${stalled}`} className="break-words text-muted-foreground motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200">
            {loading ? "Reading your saved workflow." : stalled ? "The generation worker may no longer be running." : job?.message ?? "Check status to reconnect to your saved workflow."}
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
        {expectation && <p className="break-words text-muted-foreground">{expectation}</p>}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-muted-foreground">
          {job?.startedAt && <p className="tabular-nums">{processingMs === null ? "Started earlier" : `Elapsed: ${elapsedTime(processingMs)}`}</p>}
          {job && !job.startedAt && <p>Waiting to start</p>}
          {(job && active || error) && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={checkStatus}>Check status</Button>}
        </div>
        {error && job && <p role="status" className="break-words text-warning-foreground">Unable to refresh generation status. Showing the last saved progress.</p>}
      </section>
    </div>
  </div>;
}
