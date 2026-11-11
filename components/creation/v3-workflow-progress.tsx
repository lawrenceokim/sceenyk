"use client";

import { Check, Circle, CircleAlert, Clock3, Info, LoaderCircle } from "lucide-react";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { packageBuildError } from "@/lib/final-video-generation-v3/package-status";
import { videoExecutionLabel } from "@/lib/final-video-generation-v3/video-progress";
import { v3ActionErrorMessage } from "@/lib/final-video-generation-v3/reference-errors";
import { referenceFailureLabel } from "@/lib/final-video-generation-v3/reference-status";
import { Button } from "@/components/ui/button";
import { FinalVideoReview } from "./v3-final-video-controls";
import { progressStatusLabels, storyboardProgressError, workflowProgress, type ProgressStatus } from "./v3-progress-state";
import { AppNotification } from "@/components/notifications/app-notification";


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
        {buildFailure && <AppNotification className="text-sm text-destructive">{packageBuildError(buildFailure.code)}</AppNotification>}
        {error && !buildFailure && <AppNotification className="text-sm text-destructive">{v3ActionErrorMessage(error)}</AppNotification>}
        {latestProblems.filter(t => t.kind !== "video" && (t.referenceCleanup ||
          !progress.stages.some(stage => stage.status === "completed" && (stage.id === t.kind || stage.id === "references" && ["character", "product", "location"].includes(t.kind))) &&
          !(t.kind === "join" && progress.generated))).map(t => <div key={t.id} className="space-y-2 text-sm">
          <AppNotification className="text-destructive">{t.referenceCleanup ? "Unwanted image deletion needs attention. Open Sources to retry image cleanup."
            : t.kind === "package" ? packageBuildError(t.packageBuild?.code ?? t.errorCode ?? "V3_TASK_FAILED")
              : t.location ? t.location.failureLabel : t.diagnostics ? referenceFailureLabel(t.kind, t.diagnostics)
                : t.kind === "storyboard" ? storyboardProgressError(t.errorCode)
                  : t.kind === "join" ? "Your final video could not be joined." : "Saved video deletion needs attention. Open Final Video to retry."}</AppNotification>
          {((!t.location && t.recoveryAvailable) || t.status === "reconciliation_required" && t.kind === "storyboard" || t.packageBuild?.recoverable) &&
            <Button variant="outline" disabled={busy || !!workspace.creativeLock && ["character", "product", "location", "storyboard", "package"].includes(t.kind)} onClick={() => void act("recover_task", { id: t.id })}>Recover saved response</Button>}
          {t.kind === "join" && t.status === "failed" && <Button variant="outline" disabled={busy} onClick={() => void act("recover_task", { id: t.id })}>Recover local join</Button>}
        </div>)}
      </div>
    </div>
    {workspace.runs.length > 0 && <div className="space-y-3 rounded-xl border border-border bg-card/60 p-3 sm:p-4">
      <h2 className="text-sm font-semibold">Video history</h2>
      {workspace.runs.map((run, index) => <article key={run.id} className="min-w-0 space-y-3 border-border [&+article]:border-t [&+article]:pt-3">
        <p className="text-sm">{run.segmentId === "joined" ? "Final video" : `Video ${index + 1}`} · {videoExecutionLabel(run)}</p>
        {p && run.packageId !== p.packageId && <FinalVideoReview run={run} act={act} busy={locked} segmentCount={1} compact />}
      </article>)}
    </div>}
    <aside className="flex min-w-0 gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="min-w-0 space-y-1"><h2 className="text-sm font-semibold">What this means</h2><p className="text-sm leading-relaxed text-muted-foreground">{current.guidance}</p></div>
    </aside>
  </section>;
}
