"use client";

import { useMemo, useState } from "react";
import { UgcProgressPreview, type UgcProgressState } from "./ugc-progress-preview";
import { ReferenceReviewPreview } from "./reference-review-preview";
import { StoryboardReviewPanel } from "./storyboard-review";
import { GenerationPackageReviewPanel } from "./generation-package-review";
import { FinalVideoReview } from "./final-video-review";
import { StudioPanelPortal, StudioWorkflowMedia, type StudioPreviewMedia } from "./studio-workspace-panels";

export function UgcWorkflowPreview({ projectId, progress }: { projectId: string; progress: UgcProgressState }) {
  const [selection, setSelection] = useState<{ context: string; view: "progress" | "storyboard" | "package" | "final" } | null>(null);
  const job = progress.job;
  const references = !!job?.referenceReview?.available;
  const storyboard = !!job?.storyboardEligible || !!job?.storyboard;
  const packageVisible = !!job?.generationPackage || !!job?.packageEligible || job?.storyboard?.state === "approved" && job.storyboard.current;
  const finalVisible = !!job?.finalVideo?.review || job?.generationPackage?.state === "approved" && job.generationPackage.current;
  const active = !!job && (!job.paused && (job.status === "running" || !!job.location) || job.referenceReview?.regenerating);
  const context = `${job?.id}:${active ? "active" : "settled"}:${job?.referenceReview?.groups.map(group => `${group.type}:${group.version}`).join(",")}`;
  const view = selection?.context === context ? selection.view : finalVisible ? "final" : packageVisible && !active ? "package" : storyboard && !active ? "storyboard" : "progress";
  const videoMedia = useMemo<StudioPreviewMedia[]>(() => job?.finalVideo?.review && ["review", "approved"].includes(job.finalVideo.review.state) ? [{ id: `legacy-video:${job.finalVideo.review.id}`, label: "Final Video", kind: "video",
    src: `/api/ugc/final-video/preview?${new URLSearchParams({ projectId, jobId: job.id, executionId: job.finalVideo.review.id })}` }] : [], [job, projectId]);
  const storyboardPanel = job ? <StoryboardReviewPanel projectId={projectId} jobId={job.id} storyboard={job.storyboard}
    eligible={!!job.storyboardEligible} enabled={!!job.storyboardEnabled} checkStatus={progress.checkStatus}
    onSaved={saved => progress.accept({ ...job, storyboard: saved })} /> : null;
  const packagePanel = job ? <GenerationPackageReviewPanel key={`${projectId}:${job.id}`} projectId={projectId} jobId={job.id} review={job.generationPackage}
    stalled={job.currentStage === "build_generation_package" && job.worker.state === "stalled"}
    eligible={!!job.packageEligible} enabled={!!job.packageEnabled} available={!!job.packageAvailable} checkStatus={progress.checkStatus}
    onSaved={saved => progress.accept({ ...job, generationPackage: saved })} /> : null;
  return <>
    <StudioWorkflowMedia media={videoMedia} collection="legacy-final" />
    {references && job && <ReferenceReviewPreview projectId={projectId} job={job}
      onSaved={review => progress.accept({ ...job, referenceReview: review })} checkStatus={progress.checkStatus} />}
    <StudioPanelPortal panel="workflow"><div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <div className="flex shrink-0 flex-wrap items-center gap-1 self-start rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Workflow view">
      {(["progress", "storyboard", "package", "final"] as const).map(item => <button key={item} type="button" aria-pressed={view === item}
        disabled={!job || item === "storyboard" && !storyboard || item === "package" && !packageVisible || item === "final" && !finalVisible}
        onClick={() => job && setSelection({ context, view: item })}
        className={`h-7 cursor-pointer rounded px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none [@media(pointer:coarse)]:h-11 ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        {item === "progress" ? "Progress" : item === "package" ? "Package" : item === "final" ? "Final Video" : "Storyboard"}
      </button>)}
    </div>
    {view === "final" && job ? <FinalVideoReview key={`${projectId}:${job.id}`} projectId={projectId} jobId={job.id}
      packageId={job.generationPackage?.id} value={job.finalVideo} checkStatus={progress.checkStatus}
      onSaved={saved => progress.accept({ ...job, finalVideo: saved })} /> : view === "package" && job ? packagePanel : view === "storyboard" && job ? <div className="flex min-h-0 flex-1 flex-col gap-2">{storyboardPanel}
      {packageVisible && (!job.generationPackage || job.generationPackage.state === "deleted") && packagePanel}
    </div> :
      <UgcProgressPreview progress={progress} />}
  </div></StudioPanelPortal></>;
}
