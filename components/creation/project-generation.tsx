"use client";
import { useId, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
import { FreeAllowanceSummary } from "@/components/free-allowance";
import {
  generationStageLabels,
  generationStatusLabels,
} from "@/lib/generation/contract";
import type { GenerationInputs, GenerationJob } from "@/lib/generation/types";
import { useProjectGeneration } from "./use-project-generation";
import { compositionIssueMessage } from "@/lib/composition/contract";
import { FinalVideoResult } from "./final-video-result";
import { CreditTopUp } from "@/components/payments/credit-top-up";
import { CreditBalance } from "@/components/payments/credit-balance";
import { CaptionTrackPreview } from "./caption-track";

function generationLabel(job: GenerationJob | null, planReady: boolean) {
  if (!job) return "Preview";
  if (job.status === "completed") return "Video ready";
  if (job.status === "failed") return job.stage === "rendering" ? "Render failed" : job.stage === "voice" ? "Narration failed" : "Generation failed";
  if (["verifying", "uploading", "completed"].includes(job.renderStatus ?? "")) return "Finalizing video";
  if (job.renderStatus === "rendering") return "Rendering video";
  if (job.compositionReadyAt) return "Timeline ready";
  if (job.compositionPendingAt) return "Timing adjustment required";
  if (job.compositionStartedAt) return "Checking scene timing";
  if (job.audioReadyAt) return "Preparing timeline";
  if (job.narrationPendingAt) return "Narration needs attention";
  if (job.stage === "voice") return "Generating voice-over";
  if (job.visualsReadyAt) return "Visuals ready";
  if (job.visualsPendingAt) return "Visual scenes need attention";
  if (planReady) return "Production plan ready";
  return `Generation ${generationStatusLabels[job.status].toLowerCase()}`;
}

export function ProjectGeneration({
  projectId,
  initialJob,
  initialError,
  inputs,
  hasLocalFiles,
  mediaBusy,
  mediaError,
  signedIn,
  authReady,
  children,
}: {
  projectId: string | null;
  initialJob: GenerationJob | null;
  initialError: string;
  inputs: GenerationInputs;
  hasLocalFiles: boolean;
  mediaBusy: boolean;
  mediaError: boolean;
  signedIn: boolean;
  authReady: boolean;
  children: (parts: { controls: ReactNode; output: ReactNode; status: ReactNode; label: string }) => ReactNode;
}) {
  const helpId = useId();
  const state = useProjectGeneration(projectId, initialJob, initialError, inputs);
  const active =
    state.job?.status === "queued" || state.job?.status === "processing";
  const planReady = state.job?.status === "processing" &&
    state.job.stage === "planning" && !!state.job.productionPlanReadyAt;
  const disabled =
    !authReady ||
    !projectId ||
    !inputs.prompt.trim() ||
    hasLocalFiles ||
    mediaBusy ||
    mediaError ||
    active ||
    !!state.statusError ||
    state.creating || state.quoting;
  const label = generationLabel(state.job, planReady);
  const status = (      <div role="status" aria-live="polite" className="space-y-2">
        {state.job && (
          <>
            <p className="text-body-sm font-semibold">
              {label}
            </p>
            {state.job.status === "queued" && (
              <p className="text-body-sm text-muted-foreground">
                {state.job.dispatchStatus === "dispatch_failed" ||
                state.job.dispatchStatus === "pending"
                  ? "Your request is saved and waiting for delivery. Background recovery will retry; you can leave and return."
                  : "Your request is queued for background preparation. You can leave and return to this project."}
              </p>
            )}
            {planReady && (
              <p className="text-body-sm text-muted-foreground">Your plan is saved. Supported visual scenes are next.</p>
            )}
            {state.job.status === "processing" && state.job.compositionReadyAt && <p className="text-body-sm text-muted-foreground">Your timeline is saved. Final rendering is deferred while worker capacity is resolved; your reservation remains held.</p>}
            {state.job.status === "processing" && state.job.compositionPendingAt && <>
              {[...new Set(state.job.compositionIssues?.map(compositionIssueMessage))].slice(0, 4).map(message => <p key={message} className="text-body-sm text-muted-foreground">{message}</p>)}
              <p className="text-body-sm text-muted-foreground">Your produced scenes are saved and your reservation remains held. Timing must be resolved before rendering.</p>
            </>}
            {state.job.status === "processing" && state.job.audioReadyAt && !state.job.compositionReadyAt && !state.job.compositionPendingAt && <p className="text-body-sm text-muted-foreground">Checking your saved media and scene timing. Your reservation remains held.</p>}
            {state.job.status === "processing" && state.job.narrationPendingAt && <p className="text-body-sm text-muted-foreground">Narration needs background recovery or configuration. Your saved plan and visual scenes are preserved; your reservation remains held.</p>}
            {state.job.status === "processing" && state.job.visualsReadyAt && !state.job.audioReadyAt && !state.job.narrationPendingAt && <p className="text-body-sm text-muted-foreground">Visual scenes are saved. {state.job.stage === "voice" ? "Generating required narration." : "Preparing narration."} Your reservation remains held.</p>}
            {state.job.visualsPendingAt && <p className="text-body-sm text-muted-foreground">Some scenes need an unsupported operation or background recovery. Your saved plan and any completed scenes are preserved.</p>}
            {state.job.status === "processing" && state.job.stage && !planReady && !state.job.visualsReadyAt && !state.job.visualsPendingAt && (
              <p className="text-body-sm text-muted-foreground">
                {generationStageLabels[state.job.stage]}
              </p>
            )}
            {state.job.status === "failed" && (
              <p className="text-body-sm text-destructive">
                {state.job.errorMessage}
              </p>
            )}
            <p className="break-all text-caption text-muted-foreground">
              Request {state.job.id}
            </p>
          </>
        )}
        {state.statusError && (
          <p className="text-body-sm text-destructive">{state.statusError}</p>
        )}
      </div>
);
  const output = <div className="studio-output">{state.job?.status === "completed" && projectId && <FinalVideoResult key={state.job.id} projectId={projectId} jobId={state.job.id} />}{projectId && signedIn && state.job?.compositionReadyAt && <CaptionTrackPreview key={state.job.id} projectId={projectId} jobId={state.job.id} />}</div>;
  const controls = (
    <section
      aria-label="Project generation"
      className="studio-generation"
    >
      <div className="space-y-3">
        <div>
          <p className="text-body-sm font-medium">Generation</p>
          <p id={helpId} className="mt-1 text-caption text-muted-foreground">
            {!projectId
              ? "Save your draft before generating."
              : hasLocalFiles
                ? "Upload or remove local files before generating."
                : mediaError
                  ? "Refresh your media before generating."
                  : "Queue the current prompt, settings and all uploaded project media."}
          </p>
        </div>
        {signedIn ? (
          <Button
            type="button"
            size="lg"
            disabled={disabled || (!state.retrying && (state.quoteExpired || (!!state.quote && state.quote.status !== "ready")))}
            aria-busy={state.creating || state.quoting}
            aria-describedby={helpId}
            className="generation-submit"
            onClick={() => void (state.retrying || state.quote ? state.generate() : state.reviewCost())}
          >
            <Sparkles className="size-5" aria-hidden="true" />
            {state.creating
              ? "Creating request…"
              : state.retrying
                ? "Retry request"
                : state.quoting
                  ? "Checking generation cost…"
                  : state.quote
                    ? state.quote.eligibleFreeGeneration
                      ? "Confirm free generation"
                      : `Confirm ${state.quote.requiredCredits ?? ""} credits`
                : active
                  ? "Generation requested"
                  : state.job
                    ? "Review new generation cost"
                    : "Review generation cost"}
          </Button>
        ) : (
          <AccountAction
            intent="sign-in"
            disabled={!authReady}
            className="w-full sm:w-auto"
          >
            Sign in to generate
          </AccountAction>
        )}
      </div>
      <details className="studio-generation-help"><summary>Before you generate</summary><p className="text-caption leading-relaxed text-muted-foreground">
        Requests are saved for media analysis, production planning and supported
        visual scenes. Final rendering is currently deferred while worker capacity is resolved.
        Confirming reserves the displayed allowance or credits. The reservation
        stays held for later production and is restored after a total failure
        without usable scenes.
      </p></details>
      {signedIn && <div className="flex flex-wrap items-center justify-between gap-3"><CreditBalance compact /><CreditTopUp /></div>}
      {state.quote && (
        <div className="space-y-3 rounded-lg border border-border bg-muted p-4" role="status" aria-live="polite">
          <p className="text-body-sm font-semibold">
            {state.quote.eligibleFreeGeneration
              ? `Free generation — ${state.quote.freeGenerationsRemaining} of 2 remaining`
              : state.quote.requiredCredits === null
                ? "Paid generation pricing is not available yet"
                : `This generation requires ${state.quote.requiredCredits} credits`}
          </p>
          <dl className="grid gap-2 text-body-sm sm:grid-cols-3">
            <div><dt className="text-muted-foreground">Estimated cost</dt><dd className="font-semibold">{state.quote.requiredCredits === null ? "Unavailable" : `${state.quote.requiredCredits.toLocaleString()} credits`}</dd></div>
            <div><dt className="text-muted-foreground">Available paid balance</dt><dd className="font-semibold">{state.quote.availableCredits.toLocaleString()} credits</dd></div>
            <div><dt className="text-muted-foreground">After reservation</dt><dd className="font-semibold">{state.quote.expectedRemainingCredits === null ? "—" : `${state.quote.expectedRemainingCredits.toLocaleString()} credits`}</dd></div>
          </dl>
          {state.quote.eligibleFreeGeneration && <p className="text-caption text-muted-foreground">Uses one lifetime free generation. Your paid credits stay unchanged.</p>}
          {state.quoteExpired && <p className="text-body-sm text-warning-foreground">This quote has expired. Update the quote before confirming.</p>}
          <p className="text-caption text-muted-foreground">
            {state.quote.breakdown.durationSeconds} seconds · {state.quote.breakdown.operation === "transformation" ? "Video transformation" : "New generation"}.
            {state.quote.pricingMode === "test" && " Development/test credit configuration — not final pricing."}
            {" "}Quotes expire after five minutes. Editing your request requires a new quote.
          </p>
          {state.quote.status === "insufficient_credits" && (
            <p className="text-body-sm text-destructive">
              You need {state.quote.requiredCredits} credits but currently have {state.quote.availableCredits}. You need more credits to create this video.
            </p>
          )}
          {state.quote.status === "pricing_unavailable" && (
            <p className="text-body-sm text-muted-foreground">Free generations are limited to 10 seconds and your remaining allowance. Paid credit rates are awaiting approval.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={() => void state.reviewCost()}>Update quote</Button>
          </div>
        </div>
      )}
      <FreeAllowanceSummary signedIn={signedIn} refreshKey={state.job?.updatedAt ?? ""} />
      {state.retrying && (
        <p className="text-caption text-muted-foreground">
          Retry keeps the original submitted inputs, including any settings you
          have since edited.
        </p>
      )}
      {state.error && (
        <p role="alert" className="text-body-sm text-destructive">
          {state.error}
        </p>
      )}

      {projectId && signedIn && (
        <Button
          variant="outline"
          type="button"
          disabled={state.refreshing || state.creating || state.quoting}
          aria-busy={state.refreshing}
          onClick={() => void state.refresh()}
        >
          {state.refreshing ? "Checking status…" : "Check generation status"}
        </Button>
      )}
    </section>
  );
  return children({ controls, status, output: state.job?.status === "completed" || state.job?.compositionReadyAt ? output : null, label });
}
