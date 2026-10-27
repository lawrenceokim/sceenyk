"use client";

import { useState } from "react";
import { UgcProgressPreview, type UgcProgressState } from "./ugc-progress-preview";
import { ReferenceReviewPreview } from "./reference-review-preview";
import { StoryboardReviewPanel } from "./storyboard-review";
import { GenerationPackageReviewPanel } from "./generation-package-review";

export function UgcWorkflowPreview({ projectId, progress }: { projectId: string; progress: UgcProgressState }) {
  const [selection, setSelection] = useState<{ context: string; view: "progress" | "references" | "storyboard" | "package" } | null>(null);
  const job = progress.job;
  const references = !!job?.referenceReview?.available;
  const storyboard = !!job?.storyboardEligible || !!job?.storyboard;
  const packageVisible = !!job?.generationPackage || !!job?.packageEligible || job?.storyboard?.state === "approved" && job.storyboard.current;
  const active = !!job && (!job.paused && (job.status === "running" || !!job.location) || job.referenceReview?.regenerating);
  const context = `${job?.id}:${active ? "active" : "settled"}:${job?.referenceReview?.groups.map(group => `${group.type}:${group.version}`).join(",")}`;
  const view = selection?.context === context ? selection.view : packageVisible && !active ? "package" : storyboard && !active ? "storyboard" : references && !active ? "references" : "progress";
  const storyboardPanel = job ? <StoryboardReviewPanel projectId={projectId} jobId={job.id} storyboard={job.storyboard}
    eligible={!!job.storyboardEligible} enabled={!!job.storyboardEnabled} checkStatus={progress.checkStatus}
    onSaved={saved => progress.accept({ ...job, storyboard: saved })} /> : null;
  const packagePanel = job ? <GenerationPackageReviewPanel key={`${projectId}:${job.id}`} projectId={projectId} jobId={job.id} review={job.generationPackage}
    stalled={job.currentStage === "build_generation_package" && job.worker.state === "stalled"}
    eligible={!!job.packageEligible} enabled={!!job.packageEnabled} available={!!job.packageAvailable} checkStatus={progress.checkStatus}
    onSaved={saved => progress.accept({ ...job, generationPackage: saved })} /> : null;
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <div className="flex shrink-0 flex-wrap items-center gap-1 self-start rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Preview view">
      {(["progress", "references", ...(storyboard ? ["storyboard" as const] : []), ...(packageVisible ? ["package" as const] : [])] as const).map(item => <button key={item} type="button" aria-pressed={view === item}
        disabled={!job || item === "references" && !references}
        onClick={() => job && setSelection({ context, view: item })}
        className={`h-7 cursor-pointer rounded px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none [@media(pointer:coarse)]:h-11 ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        {item === "progress" ? "Progress" : item === "references" ? "References" : item === "package" ? "Package" : "Storyboard"}
      </button>)}
    </div>
    {view === "package" && job ? packagePanel : view === "storyboard" && job ? <div className="flex min-h-0 flex-1 flex-col gap-2">{storyboardPanel}
      {packageVisible && (!job.generationPackage || job.generationPackage.state === "deleted") && packagePanel}
    </div> : view === "references" && job ? <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ReferenceReviewPreview projectId={projectId} job={job}
        onSaved={review => progress.accept({ ...job, referenceReview: review })} checkStatus={progress.checkStatus} />
      {job.storyboardEligible && (!job.storyboard || job.storyboard.state === "deleted") && <div className="shrink-0">{storyboardPanel}</div>}
    </div> :
      <UgcProgressPreview progress={progress} />}
  </div>;
}
