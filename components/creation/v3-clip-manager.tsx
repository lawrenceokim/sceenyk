"use client";

import { useState } from "react";
import { generationCreditsFromMicrousd } from "@/lib/payments/credit-pricing";
import {
  Check,
  Clapperboard,
  Clock3,
  Coins,
  Crown,
  Film,
  Info,
  Layers2,
  LoaderCircle,
  Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { uncheckedQuality } from "@/lib/final-video-generation-v3/runtime-contract";
import { videoExecutionLabel } from "@/lib/final-video-generation-v3/video-progress";
import { videoRequestBlocker } from "@/lib/final-video-generation-v3/video-request-status";
import type { StudioMode } from "@/lib/studio-mode/contract";
import { V3MergeReview } from "./v3-merge-review";
import type { FinalOperationPresentation } from "@/lib/final-video-generation-v3/final-operation";
import { useStudioPanels } from "./studio-workspace-panels";

type Action = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<boolean>;
type Clip = NonNullable<RuntimeDto["multiClip"]>["clips"][number];
const usd = (n: number) => `$${(n / 1_000_000).toFixed(2)}`;

// Presentation of the saved admission/worker codes. No eligibility is inferred here.
function clipReason(code: string) {
  const pause = videoRequestBlocker(code);
  if (pause) return pause;
  const reasons: Record<string, string> = {
    HIGGSFIELD_CREDENTIALS_REQUIRED:
      "The video provider account is not configured. Ask your administrator to complete provider setup.",
    V3_AUTHORIZATION_REQUIRED:
      "This clip needs explicit generation cost approval in its current Generation Package.",
    V3_SEGMENT_AUTHORIZATION_REQUIRED:
      "This clip has no unused spending approval. Review its current cost before generating.",
    V3_AUTHORIZATION_EXPIRED:
      "The saved spending approval expired. Review and approve the current clip cost again.",
    PACKAGE_STALE:
      "The saved project settings changed. Rebuild and approve the current Generation Package.",
    V3_PRO_DURATION_REQUIRED:
      "This saved clip plan requires Pro mode. Switch back to Pro to continue.",
    V3_RESOLUTION_PRICING_NOT_CONFIGURED:
      "A verified rate is not configured for the selected resolution. Review the resolution in Package.",
    V3_PRO_REFERENCE_LIMITS_UNVERIFIED:
      "The provider reference-limit evidence is missing or invalid. Ask your administrator to review the configured limits.",
    REFERENCE_COUNT_EXCEEDED:
      "The saved request exceeds the provider or account image-reference limit. Review the current Package.",
    OUTPUT_HOST_APPROVAL_REQUIRED:
      "The provider output needs administrator download-host approval. Then recover this saved request.",
    HIGGSFIELD_RESULT_EXPIRED:
      "The provider result has expired. Review the saved request and recovery evidence in Progress.",
    V3_PROVIDER_OUTCOME_UNKNOWN:
      "The submission outcome is unconfirmed. Reconcile the existing attempt in Progress before any new paid action.",
    V3_PRIOR_OUTCOME_REQUIRES_RECONCILIATION:
      "An earlier saved video request needs reconciliation before new work can start.",
    EXISTING_INTENT_RECONCILE_OR_REUSE:
      "A saved attempt already exists. Review or recover that attempt rather than submit another request.",
    V3_CLIP_SETUP_REQUIRED:
      "The processing service needs the individual-clip database setup. Ask your administrator to review setup in Progress.",
    V3_VIDEO_SETUP_REQUIRED:
      "The processing service needs video-generation setup. Ask your administrator to review setup in Progress.",
    V3_BACKGROUND_SETUP_REQUIRED:
      "The background processing service needs setup. Ask your administrator to review setup in Progress.",
    V3_PROVIDER_REJECTED_REVIEW_RETRY:
      "The provider rejected this attempt. Review the saved failure before approving another attempt's cost.",
  };
  return (
    reasons[code] ??
    `Saved check: ${code
      .replace(/^(V3_|HIGGSFIELD_)/, "")
      .replaceAll("_", " ")
      .toLowerCase()}. Open Progress for its technical details.`
  );
}

export function V3ClipManager({
  workspace,
  act,
  disabled,
  studioMode,
  finalOperation,
  refreshingFinal,
}: {
  workspace: RuntimeDto;
  act: Action;
  disabled: boolean;
  studioMode: StudioMode;
  finalOperation?: FinalOperationPresentation;
  refreshingFinal?: boolean;
}) {
  const group = workspace.multiClip;
  const panels = useStudioPanels();
  const [confirmation, setConfirmation] = useState<{
    clip: Clip;
    maximumMicrousd: number;
    cumulativeMaximumMicrousd: number;
  } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [approvedCost, setApprovedCost] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [detailsClipId, setDetailsClipId] = useState<string | null>(null);
  const instructionsId = `v3-clip-instructions-${workspace.projectId}`;
  const approvedCount =
    group?.clips.filter((c) =>
      workspace.runs.some((r) => r.id === c.runId && r.state === "approved"),
    ).length ?? 0;
  const heading = (
    <>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clapperboard aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="font-semibold">Final Video</h2>
            <p className="text-xs text-muted-foreground">
              Generate and review your planned clips.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={instructionsOpen}
          aria-controls={instructionsId}
          onClick={() => setInstructionsOpen((open) => !open)}
        >
          <Info aria-hidden="true" className="size-3.5" />
          How it works
        </Button>
      </div>
      {instructionsOpen && (
        <div
          id={instructionsId}
          className="rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground"
        >
          {group ? (
            <p>
              <span className="font-bold sm:text-base">
                {group.clips.length}
              </span>{" "}
              saved {group.clips.length === 1 ? "clip" : "clips"} ·{" "}
              <span className="font-bold sm:text-base">{approvedCount} </span>
              approved. Generate an eligible clip, watch it in Preview, then
              approve or reject it. Replacing a reviewable clip requires
              confirmed deletion and a new cost approval; other approved clips
              stay saved. Merging comes after.
            </p>
          ) : (
            <p>
              Approve your saved Storyboard, then build and approve its
              Generation Package. Clip controls use the saved plan and spending
              checks.
            </p>
          )}
        </div>
      )}
    </>
  );
  if (!group)
    return (
      <div className="min-w-0 space-y-3">
        {heading}
        <p className="text-sm text-muted-foreground">
          Approve the connected Storyboard, then build and approve its
          Generation Package to generate clips.
        </p>
      </div>
    );
  const request = async (
    clipId: string,
    action: string,
    payload: Record<string, unknown>,
  ) => {
    if (pending) return false;
    setPending(clipId);
    try {
      return await act(action, payload);
    } finally {
      setPending(null);
    }
  };
  const selected =
    confirmation && group.clips.find((c) => c.id === confirmation.clip.id);
  const selectedRun =
    selected && workspace.runs.find((r) => r.id === selected.runId);
  const replacementMaximum = confirmation?.maximumMicrousd ?? null;
  const snapshotChanged =
    !!confirmation &&
    (confirmation.clip.runId !== selected?.runId ||
      group.packageId !== workspace.preflight?.packageId);
  const cumulativeMaximum = confirmation?.cumulativeMaximumMicrousd ?? null;
  const spendingChanged =
    cumulativeMaximum !== null &&
    replacementMaximum !== null &&
    group.committedMicrousd + group.reservedMicrousd + replacementMaximum >
      cumulativeMaximum;
  const confirm = (clip: Clip) => {
    setApprovedCost(false);
    setConfirmation({
      clip,
      maximumMicrousd: clip.suggestedMaximumMicrousd,
      cumulativeMaximumMicrousd: Math.max(
        workspace.preflight?.estimatedCostMicrousd ?? 0,
        group.committedMicrousd +
          group.reservedMicrousd +
          clip.suggestedMaximumMicrousd,
      ),
    });
  };
  return (
    <div className="@container/final-video min-w-0 max-w-full space-y-3">
      {heading}
      <dl
        aria-label="Clip generation summary"
        className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs"
      >
        <div className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/10 px-2 py-1 font-medium text-primary">
          <Crown aria-hidden="true" className="size-3.5" />
          <dt className="sr-only">Studio mode</dt>
          <dd>{studioMode === "pro" ? "Pro" : "Basic"}</dd>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <Layers2
            aria-hidden="true"
            className="size-3.5 text-muted-foreground"
          />
          <dt className="sr-only">Planned clips</dt>
          <dd>
            {group.clips.length} planned{" "}
            {group.clips.length === 1 ? "clip" : "clips"}
          </dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-muted-foreground">
          <dt>Estimated attempts so far:</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {usd(group.committedMicrousd)}
          </dd>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-1 text-muted-foreground">
          <dt>Reserved limit:</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {usd(group.reservedMicrousd)}
          </dd>
        </div>
      </dl>
      <ol
        aria-label="Planned video clips"
        className="grid min-w-0 grid-cols-1 gap-3 @min-[32rem]/final-video:grid-cols-2"
      >
        {group.clips.map((clip) => {
          const run = workspace.runs.find((r) => r.id === clip.runId);
          const active =
            !!run &&
            [
              "queued",
              "submitting",
              "provider_processing",
              "result_saved",
            ].includes(run.state) &&
            !run.submissionBlocker &&
            !run.errorCode;
          const reviewable = run?.state === "awaiting_review";
          const locked = disabled || !!pending || workspace.proDurationRetained;
          const waiting = !run || run.state === "deleted";
          const blockers = [
            ...new Set([
              ...(waiting && !clip.canGenerate ? clip.blockers : []),
              ...(workspace.proDurationRetained
                ? ["V3_PRO_DURATION_REQUIRED"]
                : []),
              ...(run?.submissionBlocker ? [run.submissionBlocker] : []),
              ...(run?.errorCode ? [run.errorCode] : []),
              ...(run && !run.current ? ["PACKAGE_STALE"] : []),
            ]),
          ];
          const needsSetup =
            waiting && !clip.canGenerate && !clip.canRegenerate;
          const status =
            pending === clip.id && !active
              ? "Updating"
              : waiting
                ? run?.state === "deleted" && !clip.authorized
                  ? "Rejected"
                  : needsSetup
                    ? "Setup required"
                    : "Waiting"
                : run.state === "approved"
                  ? "Approved"
                  : run.state === "failed"
                    ? "Failed"
                    : run.state === "reconciliation_required"
                      ? "Recovery needed"
                      : reviewable
                        ? run.preview
                          ? "Ready for review"
                          : "Preview unavailable"
                        : videoExecutionLabel(run);
          const statusClass =
            run?.state === "approved"
              ? "bg-success-surface text-success-foreground"
              : run?.state === "failed"
                ? "bg-destructive/10 text-destructive"
                : needsSetup || blockers.length
                  ? "bg-warning-surface text-warning-foreground"
                  : reviewable
                    ? "bg-info-surface text-info-foreground"
                    : "bg-primary/10 text-primary";
          return (
            <li
              key={clip.id}
              className="flex min-w-0 max-w-full flex-col gap-3 rounded-xl border border-primary/20 bg-card p-3 text-card-foreground"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  Clip {clip.number}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {clip.durationMs / 1000}s
                  </span>
                </h3>
                <span
                  role="status"
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium ${statusClass}`}
                >
                  {(active || pending === clip.id) && (
                    <LoaderCircle
                      aria-label={`Generating clip ${clip.number}`}
                      className="size-3.5 motion-safe:animate-spin"
                    />
                  )}
                  {waiting && !pending && (
                    <Clock3 aria-hidden="true" className="size-3.5 shrink-0" />
                  )}
                  {run?.state === "approved" && (
                    <Check aria-hidden="true" className="size-3.5" />
                  )}
                  {status}
                </span>
              </div>
              <p className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">
                {clip.purpose}
              </p>
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Film aria-hidden="true" className="size-3.5" />
                  {clip.startMs / 1000}–{clip.endMs / 1000}s
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <Coins aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    Estimate{" "}
                    {clip.estimatedCostMicrousd === null
                      ? "unavailable"
                      : `~${usd(clip.estimatedCostMicrousd)} · ${generationCreditsFromMicrousd(clip.estimatedCostMicrousd).toLocaleString()} credits`}
                  </span>
                </span>
              </div>
              <div className="mt-auto flex min-w-0 flex-wrap gap-2 [&>button]:max-w-full [&>button]:whitespace-normal">
                {(!run || run.state === "deleted") && (
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={locked || !clip.canGenerate}
                    onClick={() =>
                      void request(clip.id, "generate_clip", {
                        packageId: group.packageId,
                        packageHash: group.packageHash,
                        clipId: clip.id,
                        segmentId: clip.segmentId,
                      })
                    }
                  >
                    <Play aria-hidden="true" className="size-3.5" />
                    Generate Clip
                  </Button>
                )}
                {run?.preview &&
                  ["awaiting_review", "approved"].includes(run.state) && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => panels?.selectMedia(`v3-video:${run.id}`)}
                    >
                      View in Preview
                    </Button>
                  )}
                {reviewable && (
                  <>
                    {run.preview && (
                      <Button
                        size="sm"
                        disabled={locked || !run.current}
                        onClick={() =>
                          void request(clip.id, "approve", {
                            id: run.id,
                            reviewMode: "direct",
                          })
                        }
                      >
                        Approve Clip
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() => confirm(clip)}
                    >
                      Reject and Delete
                    </Button>
                  </>
                )}
                {(reviewable || (clip.canRegenerate && !clip.authorized)) && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked || !run?.current}
                    onClick={() => confirm(clip)}
                  >
                    Regenerate
                  </Button>
                )}
                {clip.canRenewAuthorization && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={locked}
                    onClick={() => confirm(clip)}
                  >
                    Approve Clip Cost
                  </Button>
                )}
                {run &&
                  (run.state === "reconciliation_required" ||
                    run.state === "deleting" ||
                    (run.state === "provider_processing" && run.errorCode)) && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() =>
                        void request(clip.id, "recover", { id: run.id })
                      }
                    >
                      {run.state === "deleting"
                        ? "Retry deletion"
                        : "Recover saved work"}
                    </Button>
                  )}
                {run?.state === "queued" &&
                  run.submissionBlocker === "V3_REFERENCE_DELIVERY_EXPIRED" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={locked}
                      onClick={() =>
                        void request(clip.id, "refresh_video_delivery", {
                          id: run.id,
                        })
                      }
                    >
                      Refresh saved request links
                    </Button>
                  )}
              </div>
              <div className="min-w-0 border-t border-border pt-2">
                <Dialog
                  open={detailsClipId === clip.id}
                  onOpenChange={(open) =>
                    setDetailsClipId(open ? clip.id : null)
                  }
                >
                  <DialogTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start text-muted-foreground"
                      />
                    }
                    aria-label={`Clip ${clip.number} details`}
                  >
                    <Info aria-hidden="true" className="size-3.5 shrink-0" />
                    Details
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Clip {clip.number} details</DialogTitle>
                      <DialogDescription>
                        {clip.durationMs / 1000}s · {clip.startMs / 1000}–
                        {clip.endMs / 1000}s · {status}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="min-w-0 space-y-2 break-words pt-2 text-xs leading-relaxed text-muted-foreground">
                      {blockers.length > 0 && (
                        <ul
                          className="space-y-2"
                          aria-label={`Clip ${clip.number} saved requirements`}
                        >
                          {blockers.map((code) => (
                            <li key={code}>{clipReason(code)}</li>
                          ))}
                        </ul>
                      )}
                      {needsSetup && blockers.length === 0 && (
                        <p>
                          The saved eligibility check does not allow this clip
                          to generate yet. Open Progress to inspect the current
                          prerequisite check.
                        </p>
                      )}
                      {reviewable && !run.preview && (
                        <p>
                          This clip&apos;s saved Preview link is unavailable.
                          Review it once the existing status refresh restores
                          access.
                        </p>
                      )}
                      {run?.state === "failed" && !run.errorCode && (
                        <p>
                          The saved attempt failed. Open Progress for its
                          recorded failure and recovery information.
                        </p>
                      )}
                      <p>
                        {clip.attempts > 0
                          ? `${clip.attempts} saved ${clip.attempts === 1 ? "attempt" : "attempts"}.`
                          : "No attempts submitted yet."}
                        {run ? ` ${videoExecutionLabel(run)}.` : ""}
                      </p>
                      {clip.needsContinuityReview && (
                        <p className="text-warning-foreground">
                          An earlier clip was regenerated. Review this
                          clip&apos;s continuity again; its saved output and
                          approval are preserved.
                        </p>
                      )}
                      <p>{clip.purpose}</p>
                      <p>
                        Technical request and worker diagnostics remain in
                        Progress.
                      </p>
                    </div>
                    <DialogFooter>
                      <DialogClose render={<Button size="sm" />}>
                        OK
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </li>
          );
        })}
      </ol>
      <V3MergeReview workspace={workspace} act={act} disabled={disabled || !!pending || !!workspace.proDurationRetained} operation={finalOperation} refreshing={refreshingFinal} />
      <Dialog
        open={!!confirmation}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedRun?.state === "awaiting_review"
                ? `Delete Clip ${selected?.number}?`
                : `Approve Clip ${selected?.number} ${selectedRun ? "regeneration" : "generation"} cost`}
            </DialogTitle>
            <DialogDescription>
              {selectedRun?.state === "awaiting_review"
                ? "This permanently deletes only this unapproved clip and its local copies. Other clips stay saved. Regeneration requires a new cost approval after deletion finishes."
                : `Approve one new attempt estimated at ${selected?.estimatedCostMicrousd == null ? "unavailable" : usd(selected.estimatedCostMicrousd)}, with a maximum of ${replacementMaximum === null ? "unavailable" : usd(replacementMaximum)}. Earlier attempts remain counted. Subsequent clips may need continuity review. After approval, choose Generate Clip.`}
            </DialogDescription>
          </DialogHeader>
          {selectedRun?.state !== "awaiting_review" &&
            cumulativeMaximum !== null && (
              <p className="text-xs text-muted-foreground">
                Cumulative spending ceiling, including previous attempts and
                reserved grants: {usd(cumulativeMaximum)}.
              </p>
            )}
          {spendingChanged && (
            <p role="alert" className="text-sm text-warning-foreground">
              Spending reservations changed. Close this dialog and review the
              updated cost before approving.
            </p>
          )}
          {selectedRun?.state !== "awaiting_review" && (
            <label className="flex min-h-11 items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={approvedCost}
                onChange={(e) => setApprovedCost(e.target.checked)}
                className="mt-1 size-4 accent-primary"
              />
              I approve this new attempt and its spending limit.
            </label>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={!!pending}
              onClick={() => setConfirmation(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                disabled ||
                !!workspace.proDurationRetained ||
                !!pending ||
                snapshotChanged ||
                !selected ||
                (selectedRun?.state !== "awaiting_review" &&
                  (spendingChanged ||
                    !approvedCost ||
                    replacementMaximum === null ||
                    (!selected.canRegenerate &&
                      !selected.canRenewAuthorization)))
              }
              onClick={() => {
                if (!selected) return;
                void request(
                  selected.id,
                  selectedRun?.state === "awaiting_review"
                    ? "reject_delete"
                    : "authorize_clip",
                  selectedRun?.state === "awaiting_review"
                    ? {
                        id: selectedRun.id,
                        quality: selectedRun.quality ?? uncheckedQuality,
                        confirmedDeletion: true,
                      }
                    : {
                        operatorApproved: true,
                        packageId: group.packageId,
                        packageHash: group.packageHash,
                        quoteId: workspace.preflight?.quoteId,
                        segmentId: selected.segmentId,
                        previousRunId: selectedRun?.id ?? null,
                        maximumMicrousd: replacementMaximum,
                        cumulativeMaximumMicrousd: cumulativeMaximum,
                      },
                ).then((ok) => {
                  if (ok) setConfirmation(null);
                });
              }}
            >
              {selectedRun?.state === "awaiting_review"
                ? "Confirm deletion"
                : "Approve regeneration cost"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
