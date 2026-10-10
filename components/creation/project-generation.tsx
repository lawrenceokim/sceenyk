"use client";
import { useId } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccountAction } from "@/components/account-action";
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
  const state = useProjectGeneration(projectId, initialJob, initialError);
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
    state.creating;
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
            disabled={disabled}
            aria-busy={state.creating}
            aria-describedby={helpId}
            className="w-full sm:w-auto"
            onClick={() => void state.generate(inputs)}
          >
            <Sparkles className="size-5" aria-hidden="true" />
            {state.creating
              ? "Creating request…"
              : state.retrying
                ? "Retry request"
                : active
                  ? "Generation requested"
                  : state.job
                    ? "New generation"
                    : "Generate"}
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
        is not connected yet, so preparation ends without generated content. No
        credits are used.
      </p>
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
          disabled={state.refreshing || state.creating}
          aria-busy={state.refreshing}
          onClick={() => void state.refresh()}
        >
          {state.refreshing ? "Checking status…" : "Check generation status"}
        </Button>
      )}
    </section>
  );
}
