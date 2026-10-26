"use client";

import { useState } from "react";
import { UgcProgressPreview, type UgcProgressState } from "./ugc-progress-preview";
import { ReferenceReviewPreview } from "./reference-review-preview";

export function UgcWorkflowPreview({ projectId, progress }: { projectId: string; progress: UgcProgressState }) {
  const [selection, setSelection] = useState<{ context: string; view: "progress" | "references" } | null>(null);
  const job = progress.job;
  const references = !!job?.referenceReview?.available;
  const active = !!job && (!job.paused && (job.status === "running" || !!job.location) || job.referenceReview?.regenerating);
  const context = `${job?.id}:${active ? "active" : "settled"}:${job?.referenceReview?.groups.map(group => `${group.type}:${group.version}`).join(",")}`;
  const view = selection?.context === context ? selection.view : references && !active ? "references" : "progress";
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
    <div className="flex shrink-0 items-center gap-1 self-start rounded-md border border-border bg-muted/40 p-0.5" role="group" aria-label="Preview view">
      {(["progress", "references"] as const).map(item => <button key={item} type="button" aria-pressed={view === item}
        disabled={!job || item === "references" && !references}
        onClick={() => job && setSelection({ context, view: item })}
        className={`h-7 cursor-pointer rounded px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none [@media(pointer:coarse)]:h-11 ${view === item ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
        {item === "progress" ? "Progress" : "References"}
      </button>)}
    </div>
    {view === "references" && job ? <ReferenceReviewPreview projectId={projectId} job={job}
      onSaved={review => progress.accept({ ...job, referenceReview: review })} checkStatus={progress.checkStatus} /> :
      <UgcProgressPreview progress={progress} />}
  </div>;
}
