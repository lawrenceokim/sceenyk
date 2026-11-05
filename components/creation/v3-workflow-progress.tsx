"use client";

import type { ReactNode } from "react";
import { Check, ChevronDown, Circle, CircleAlert, Clock3, Info, KeyRound, Layers2, LoaderCircle, Video } from "lucide-react";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { defaultVideoResolution } from "@/lib/projects/video-resolution";
import { packageBuildError } from "@/lib/final-video-generation-v3/package-status";
import { videoExecutionLabel } from "@/lib/final-video-generation-v3/video-progress";
import { v3ActionErrorMessage } from "@/lib/final-video-generation-v3/reference-errors";
import { referenceFailureLabel } from "@/lib/final-video-generation-v3/reference-status";
import { Button } from "@/components/ui/button";
import { FinalVideoReview } from "./v3-final-video-controls";
import { progressStatusLabels, storyboardProgressError, workflowProgress, type ProgressStatus } from "./v3-progress-state";

const statusStyles: Record<ProgressStatus, string> = {
  not_started: "border-border bg-muted text-muted-foreground",
  in_progress: "border-primary/40 bg-primary/10 text-primary",
  waiting_approval: "border-warning-foreground/30 bg-warning-surface text-warning-foreground",
  completed: "border-success-foreground/30 bg-success-surface text-success-foreground",
  needs_attention: "border-warning-foreground/30 bg-warning-surface text-warning-foreground",
  failed: "border-destructive/30 bg-destructive-surface text-destructive",
};
function StatusIcon({ status }: { status: ProgressStatus }) {
  const Icon = status === "completed" ? Check : status === "in_progress" ? LoaderCircle : status === "waiting_approval" ? Clock3
    : status === "needs_attention" || status === "failed" ? CircleAlert : Circle;
  return <Icon aria-hidden="true" className={"size-4 shrink-0 " + (status === "in_progress" ? "motion-safe:animate-spin" : "")} />;
}
function TechnicalSection({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <details className="group min-w-0 rounded-xl border border-border bg-card/60">
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 [&::-webkit-details-marker]:hidden">
      <span className="shrink-0 text-primary">{icon}</span>
      <span className="min-w-0 flex-1">{title}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" />
    </summary>
    <div className="min-w-0 space-y-3 border-t border-border px-3 py-3 text-xs text-muted-foreground sm:px-4">{children}</div>
  </details>;
}
function Fields({ values }: { values: Record<string, string | number | null | undefined> }) {
  return <dl className="grid min-w-0 grid-cols-1 gap-x-4 gap-y-1.5 @min-[25rem]/progress:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
    {Object.entries(values).filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) =>
      <div key={label} className="contents"><dt>{label}</dt><dd className="min-w-0 [overflow-wrap:anywhere] text-foreground mb-1.5 @min-[25rem]/progress:mb-0">{value}</dd></div>)}
  </dl>;
}
const money = (amount: number | null | undefined) => amount == null ? null : `$${(amount / 1_000_000).toFixed(2)}`;
type Action = (action: string, payload?: Record<string, unknown>) => Promise<boolean>;

export function V3WorkflowProgress({ workspace, productRequired, busy, locked, error, buildFailure, act }: {
  workspace: RuntimeDto;
  productRequired: boolean;
  busy: boolean;
  locked: boolean;
  error?: string;
  buildFailure: { code: string; httpStatus: number | null } | null;
  act: Action;
}) {
  const progress = workflowProgress(workspace, productRequired), current = progress.current;
  const p = workspace.preflight;
  const packageTask = workspace.tasks.filter(t => t.kind === "package").at(-1);
  const build = packageTask?.packageBuild;
  const latestProblems = workspace.tasks.filter((t, index, all) =>
    t.status !== "done" && t.errorCode !== "V3_REFERENCE_REQUEST_SUPERSEDED" &&
    !all.slice(index + 1).some(n => n.kind === t.kind && (t.kind !== "character" || n.characterId === t.characterId) && !!n.referenceCleanup === !!t.referenceCleanup) &&
    (t.current || t.providerStarted || t.referenceCleanup || ["package", "join", "delete"].includes(t.kind)) &&
    ["failed", "reconciliation_required", "cleanup_pending"].includes(t.status));
  return <section aria-label="Workflow progress" className="@container/progress min-w-0 space-y-4">
    <p className="text-sm text-muted-foreground">Track where your project is and what happens next.</p>
    <div className="grid min-w-0 gap-4 @min-[30rem]/progress:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <ol aria-label="Generation stages" className="min-w-0 space-y-0 px-1">
        {progress.stages.map((stage, index) => <li key={stage.id} aria-current={stage.id === current.id ? "step" : undefined} className="relative flex min-w-0 gap-3 pb-4 last:pb-0">
          {index < progress.stages.length - 1 && <span aria-hidden="true" className={"absolute top-7 bottom-0 left-3 w-px " + (stage.status === "completed" ? "bg-primary/50" : "bg-border")} />}
          <span className={"relative mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border " + (progress.complete && stage.id === "final" ? "border-primary/40 bg-primary/15 text-primary" : statusStyles[stage.status])}><StatusIcon status={stage.status} /></span>
          <div className="min-w-0"><p className="text-sm font-semibold">{stage.title}</p><p className="text-xs text-muted-foreground">{progressStatusLabels[stage.status]}</p></div>
        </li>)}
      </ol>
      <div role="status" aria-live="polite" aria-atomic="true" className="min-w-0 self-start space-y-3 rounded-xl border border-border bg-card/60 p-4">
        <h2 className="text-xs font-medium text-muted-foreground">Current state</h2>
        <p className={"inline-flex max-w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-semibold " + (progress.complete ? "border-primary/30 bg-primary/15 text-primary" : statusStyles[current.status])}>
          <StatusIcon status={current.status} />{progress.complete ? "Complete" : `${current.title} · ${progressStatusLabels[current.status]}`}
        </p>
        <p className="text-sm leading-relaxed">{current.description}</p>
        {buildFailure && <p className="text-sm text-destructive">{packageBuildError(buildFailure.code)}</p>}
        {error && !buildFailure && <p className="text-sm text-destructive">{v3ActionErrorMessage(error)}</p>}
        {latestProblems.filter(t => t.kind !== "video" && (t.referenceCleanup ||
          !progress.stages.some(stage => stage.status === "completed" && (stage.id === t.kind || stage.id === "references" && ["character", "product", "location"].includes(t.kind))) &&
          !(t.kind === "join" && progress.generated))).map(t => <div key={t.id} className="space-y-2 text-sm">
          <p className="text-destructive">{t.referenceCleanup ? "Unwanted image deletion needs attention. Open Sources to retry image cleanup."
            : t.kind === "package" ? packageBuildError(t.packageBuild?.code ?? t.errorCode ?? "V3_TASK_FAILED")
              : t.location ? t.location.failureLabel : t.diagnostics ? referenceFailureLabel(t.kind, t.diagnostics)
                : t.kind === "storyboard" ? storyboardProgressError(t.errorCode)
                  : t.kind === "join" ? "Your final video could not be joined." : "Saved video deletion needs attention. Open Final Video to retry."}</p>
          {((!t.location && t.recoveryAvailable) || t.status === "reconciliation_required" && t.kind === "storyboard" || t.packageBuild?.recoverable) &&
            <Button variant="outline" disabled={busy} onClick={() => void act("recover_task", { id: t.id })}>Recover saved response</Button>}
          {t.kind === "join" && t.status === "failed" && <Button variant="outline" disabled={busy} onClick={() => void act("recover_task", { id: t.id })}>Recover local join</Button>}
        </div>)}
      </div>
    </div>
    <div className="space-y-3">
      <TechnicalSection title="Package technical details" icon={<Layers2 aria-hidden="true" className="size-4" />}>
        {!p && !build && !buildFailure && <p>No Generation Package has been saved yet.</p>}
        <Fields values={{ "Package state": progress.stages[2].description, Stage: buildFailure ? null : build?.stage,
          Code: buildFailure?.code ?? build?.code, "HTTP status": buildFailure?.httpStatus ?? build?.httpStatus,
          "Package ID": p?.packageId ?? build?.packageId, "Segment ID": build?.segmentId, "Selected output": workspace.selectedResolution ?? defaultVideoResolution, "Frozen package resolution": p?.resolution,
          "Estimate status": build?.estimateStatus, Recoverable: build ? build.recoverable ? "Yes" : "No" : null }} />
        {latestProblems.filter(t => t.kind === "storyboard").map(t => <Fields key={t.id} values={{ "Storyboard task": t.status, "Storyboard error": t.errorCode }} />)}
      </TechnicalSection>
      <TechnicalSection title="Final Video prerequisites" icon={<KeyRound aria-hidden="true" className="size-4" />}>
        {p ? <>
          {progress.generated && <p>The video is already generated. The submission checks below apply to a new request and do not indicate a failure of this video.</p>}
          <Fields values={{ "Package validity": workspace.packageStale ? "stale" : p.currentness,
            Authorization: p.authorizationState, "Generation availability": p.transportEnabled ? "Enabled" : "Paused by administrator",
            [progress.generated || progress.runs.length ? "New submission allowed" : "Submission allowed"]: p.canSubmit ? "Yes" : "No",
            [progress.generated || progress.runs.length ? "New-request prerequisite codes" : "Blocking reasons"]: p.issues.length ? p.issues.join(", ") : null }} />
        </> : <p>{workspace.packageStale ? "The saved package is out of date. Rebuild it after approving current inputs." : "Build a Generation Package to inspect its video prerequisites."}</p>}
      </TechnicalSection>
      <TechnicalSection title="Final Video details" icon={<Video aria-hidden="true" className="size-4" />}>
        {!workspace.runs.length && <p>No video-generation request has been saved yet.</p>}
        {workspace.runs.map((run, index) => <article key={run.id} className="min-w-0 space-y-3 border-border [&+article]:border-t [&+article]:pt-3">
          <h3 className="text-xs font-semibold text-foreground">{run.segmentId === "joined" ? "Joined final video" : `Video attempt ${index + 1}`}{run.packageId !== p?.packageId || !run.current ? " · Previous saved work" : ""}</h3>
          <Fields values={{ Status: videoExecutionLabel(run), "Saved inputs": run.current ? "Current" : "Out of date",
            "Requested resolution": run.resolution, "Actual output": run.actualDimensions ? `${run.actualDimensions.width} × ${run.actualDimensions.height}` : null,
            Format: run.aspectRatio, Provider: run.provider, Model: run.model,
            Duration: run.actualDurationMs === null ? null : `${run.actualDurationMs / 1000}s`,
            Audio: run.hasAudio === null ? null : run.hasAudio ? "Present" : "Absent",
            "Estimated cost": money(run.displayEstimatedCostMicrousd ?? run.estimatedCostMicrousd) === null ? null : `~${money(run.displayEstimatedCostMicrousd ?? run.estimatedCostMicrousd)}`,
            "Actual provider cost": money(run.actualCostMicrousd), "Execution stage": run.stage?.stage,
            Segment: p?.segmentCount && p.segmentCount > 1 ? run.segmentId : null,
            "Error code": run.errorCode, "Submission pause": run.submissionBlocker,
            "Download host requiring administrator approval": run.outputHostname }} />
          {(run.expectedDialogue.length > 0 || run.shotTimings.length > 0) && <details>
            <summary className="min-h-8 cursor-pointer py-1 outline-none focus-visible:ring-2 focus-visible:ring-ring">Expected dialogue and shot timing</summary>
            <div className="space-y-1 pt-2 [overflow-wrap:anywhere]">
              {run.expectedDialogue.map((line, i) => <p key={i}>{line.startMs / 1000}–{line.endMs / 1000}s · {line.speaker}: {line.text}</p>)}
              {run.shotTimings.map(shot => <p key={shot.number}>Shot {shot.number}: {shot.startMs / 1000}–{shot.endMs / 1000}s</p>)}
            </div>
          </details>}
          {/* Preserve the existing recovery/review owner for earlier saved attempts. */}
          {p && run.packageId !== p.packageId && <FinalVideoReview run={run} act={act} busy={locked} segmentCount={1} compact />}
        </article>)}
      </TechnicalSection>
    </div>
    <aside className="flex min-w-0 gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 space-y-1"><h2 className="text-sm font-semibold">What this means</h2><p className="text-sm leading-relaxed text-muted-foreground">{current.guidance}</p></div>
    </aside>
  </section>;
}
