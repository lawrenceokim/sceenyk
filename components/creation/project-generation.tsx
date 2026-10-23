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
import type { CreationType } from "@/lib/projects/options";

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
  creationType = "freestyle",
  ugcControls,
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
  creationType?: CreationType;
  ugcControls?: ReactNode;
  children: (parts: { controls: ReactNode; output: ReactNode; status: ReactNode; label: string }) => ReactNode;
}) {
  const helpId = useId();
  const state = useProjectGeneration(projectId, initialJob, initialError, inputs);
  const active =
    state.job?.status === "queued" || state.job?.status === "processing";
  const planReady = state.job?.status === "processing" &&
    state.job.stage === "planning" && !!state.job.productionPlanReadyAt;
  const disabled =
    creationType === "ugc" ||
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
                  ? "Delivery pending. Recovery will retry."
                  : "Queued for preparation."}
              </p>
            )}
            {planReady && (
              <p className="text-body-sm text-muted-foreground">Plan saved. Preparing scenes.</p>
            )}
            {state.job.status === "processing" && state.job.compositionReadyAt && <p className="text-body-sm text-muted-foreground">Timeline saved. Rendering deferred; reservation held.</p>}
            {state.job.status === "processing" && state.job.compositionPendingAt && <>
              {[...new Set(state.job.compositionIssues?.map(compositionIssueMessage))].slice(0, 4).map(message => <p key={message} className="text-body-sm text-muted-foreground">{message}</p>)}
              <p className="text-body-sm text-muted-foreground">Timing needs attention; reservation held.</p>
            </>}
            {state.job.status === "processing" && state.job.audioReadyAt && !state.job.compositionReadyAt && !state.job.compositionPendingAt && <p className="text-body-sm text-muted-foreground">Checking timing; reservation held.</p>}
            {state.job.status === "processing" && state.job.narrationPendingAt && <p className="text-body-sm text-muted-foreground">Narration needs recovery; reservation held.</p>}
            {state.job.status === "processing" && state.job.visualsReadyAt && !state.job.audioReadyAt && !state.job.narrationPendingAt && <p className="text-body-sm text-muted-foreground">Visual scenes are saved. {state.job.stage === "voice" ? "Generating required narration." : "Preparing narration."} Reservation held.</p>}
            {state.job.visualsPendingAt && <p className="text-body-sm text-muted-foreground">Scenes saved. Recovery required.</p>}
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
          </>
        )}
        {state.statusError && (
          <p className="text-body-sm text-destructive">{state.statusError}</p>
        )}
      </div>
);
  const output = <div className={"studio-output [&&:empty]:hidden max-767:[&&]:flex max-767:[&&]:min-h-0 max-767:[&&]:flex-1 max-767:[&&]:flex-col max-767:[&&_>_*]:min-h-0 max-767:[&&_>_*]:flex-1 [&&_video]:max-h-[72dvh] max-767:[&&_video]:max-h-full"}>{state.job?.status === "completed" && projectId && <FinalVideoResult key={state.job.id} projectId={projectId} jobId={state.job.id} />}{projectId && signedIn && state.job?.compositionReadyAt && <CaptionTrackPreview key={state.job.id} projectId={projectId} jobId={state.job.id} />}</div>;
  const controls = (
    <section
      aria-label="Project generation"
      className={`
      studio-generation [&&]:text-[length:12px] [&&]:pt-[16px] [&&_>_*_+_*]:mt-[12px] [&&_dl]:[grid-template-columns:1fr]
      [&&_[data-slot='button']]:min-h-[var(--workspace-control-height)] [&&_[data-slot='button']]:h-[auto]
      [&&_[data-slot='button']]:pt-[6px] [&&_[data-slot='button']]:pr-[8px] [&&_[data-slot='button']]:pb-[6px]
      [&&_[data-slot='button']]:pl-[8px] [&&_[data-slot='button']]:rounded-[var(--ui-radius-control)]
      [&&_[data-slot='button']]:text-[length:var(--ui-text-control)] [&&_[data-slot='button']]:whitespace-normal
      [&&_.generation-submit]:w-[100%] [&&_.generation-submit]:whitespace-normal [&&_.generation-submit]:h-[auto]
      [&&_.generation-submit]:min-h-[36px] [&&_.generation-submit]:pt-[8px] [&&_.generation-submit]:pr-[8px]
      [&&_.generation-submit]:pb-[8px] [&&_.generation-submit]:pl-[8px] [&&_.generation-submit]:text-[length:12px]
      [&&_h2]:text-[length:var(--ui-text-panel)] [&&_h2]:font-[600]
    `}
    >
      <div className="space-y-3">
        <div>
          <p className="text-body-sm font-medium">Generation</p>
          <p id={helpId} className={creationType === "ugc" || (projectId && !hasLocalFiles && !mediaError) ? "sr-only" : "mt-1 text-caption text-muted-foreground"}>
            {!projectId
              ? "Save your draft before generating."
              : hasLocalFiles
                ? "Upload or remove local files before generating."
                : mediaError
                  ? "Refresh your media before generating."
                  : "Review cost before confirming."}
          </p>
        </div>
        {creationType === "ugc" ? ugcControls ?? <p className="text-caption text-muted-foreground">UGC generation is not available yet.</p> : signedIn ? (
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
      {signedIn && <div className="flex flex-wrap items-center justify-between gap-3"><CreditBalance compact /><CreditTopUp /></div>}
      {creationType === "freestyle" && state.quote && (
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
          {state.quote.eligibleFreeGeneration && <p className="text-caption text-muted-foreground">Free allowance · no paid credits used.</p>}
          {state.quoteExpired && <p className="text-body-sm text-warning-foreground">This quote has expired. Update the quote before confirming.</p>}
          <p className="text-caption text-muted-foreground">
            {state.quote.breakdown.durationSeconds} seconds · {state.quote.breakdown.operation === "transformation" ? "Video transformation" : "New generation"}.
            {state.quote.pricingMode === "test" && " Test pricing."}
            {" "}Valid for five minutes; edits require a new quote.
          </p>
          {state.quote.status === "insufficient_credits" && (
            <p className="text-body-sm text-destructive">
              You need {state.quote.requiredCredits} credits but currently have {state.quote.availableCredits}. You need more credits to create this video.
            </p>
          )}
          {state.quote.status === "pricing_unavailable" && (
            <p className="text-body-sm text-muted-foreground">Paid pricing unavailable. Free generation: up to 10 seconds.</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={disabled} onClick={() => void state.reviewCost()}>Update quote</Button>
          </div>
        </div>
      )}
      <FreeAllowanceSummary compact signedIn={signedIn} refreshKey={state.job?.updatedAt ?? ""} />
      {state.retrying && (
        <p className="text-caption text-muted-foreground">
          Retry uses the original request.
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
