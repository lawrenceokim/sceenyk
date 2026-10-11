"use client";
import { useId } from "react";
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
}) {
  const helpId = useId();
  const state = useProjectGeneration(projectId, initialJob, initialError, inputs);
  const active =
    state.job?.status === "queued" || state.job?.status === "processing";
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
  return (
    <section
      aria-label="Project generation"
      className="sceenyk-card space-y-4 p-5 sm:p-6"
    >
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <p className="text-body-sm font-medium">Ready for the next scene?</p>
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
            disabled={disabled || (!!state.quote && state.quote.status !== "ready")}
            aria-busy={state.creating || state.quoting}
            aria-describedby={helpId}
            className="w-full sm:w-auto"
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
      <p className="text-caption leading-relaxed text-muted-foreground">
        Requests are saved and sent for background preparation. Video production
        is not connected yet, so preparation ends without generated content.
        Confirming reserves the displayed free allowance or credits; preparation
        restores the reservation when it ends without a usable result.
      </p>
      {state.quote && (
        <div className="space-y-3 rounded-lg border border-border bg-muted p-4" role="status" aria-live="polite">
          <p className="text-body-sm font-semibold">
            {state.quote.eligibleFreeGeneration
              ? `Free generation — ${state.quote.freeGenerationsRemaining} of 2 remaining`
              : state.quote.requiredCredits === null
                ? "Paid generation pricing is not available yet"
                : `This generation requires ${state.quote.requiredCredits} credits`}
          </p>
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
            {state.quote.status !== "ready" && (
              <Button type="button" variant="outline" disabled>Buy credits — coming soon</Button>
            )}
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
      <div role="status" aria-live="polite" className="space-y-2">
        {state.job && (
          <>
            <p className="text-body-sm font-semibold">
              Generation{" "}
              {generationStatusLabels[state.job.status].toLowerCase()}
            </p>
            {state.job.status === "queued" && (
              <p className="text-body-sm text-muted-foreground">
                {state.job.dispatchStatus === "dispatch_failed" ||
                state.job.dispatchStatus === "pending"
                  ? "Your request is saved and waiting for delivery. Background recovery will retry; you can leave and return."
                  : "Your request is queued for background preparation. You can leave and return to this project."}
              </p>
            )}
            {state.job.status === "processing" && state.job.stage && (
              <p className="text-body-sm text-muted-foreground">
                {generationStageLabels[state.job.stage]}
              </p>
            )}
            {state.job.status === "completed" && (
              <p className="text-body-sm text-muted-foreground">
                The job is marked completed. No generated output is available in
                this version.
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
}
