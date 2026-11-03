"use client";
import { V3LocationStatus } from "./v3-location-status";
import { V3StoryboardContent } from "./v3-storyboard-content";
import { StudioWorkflowGuidance } from "./studio-workflow-guidance";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  StudioPanelPortal,
  StudioWorkflowMedia,
  useStudioPanels,
  type StudioPreviewMedia,
} from "./studio-workspace-panels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ProjectAsset } from "@/lib/media/types";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import {
  uncheckedQuality,
  type Quality,
} from "@/lib/final-video-generation-v3/runtime-contract";
import {
  referenceBusy,
  v3ProgressLabel,
} from "@/lib/final-video-generation-v3/progress";
import { v3ActionErrorMessage } from "@/lib/final-video-generation-v3/reference-errors";
import { ReferenceRegenerationDialog } from "./reference-regeneration-dialog";
import { referenceFailureLabel } from "@/lib/final-video-generation-v3/reference-status";
import { locationReferenceFeedback } from "@/lib/final-video-generation-v3/reference-prerequisites";
import {
  packageBuildLabel,
  packageBuildError,
} from "@/lib/final-video-generation-v3/package-status";

const field =
  "w-full rounded-lg border border-border bg-background p-2 text-sm";
const money = (amount: number | null) => {
  if (amount === null) return "Unavailable";
  const cents = (BigInt(amount) + BigInt(5000)) / BigInt(10000);
  return `$${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
};
const videoStateLabels: Record<RuntimeDto["runs"][number]["state"], string> = {
  queued: "Waiting to generate",
  submitting: "Starting video",
  provider_processing: "Generating video",
  reconciliation_required: "Video needs attention",
  result_saved: "Preparing preview",
  awaiting_review: "Ready for review",
  approved: "Approved video",
  failed: "Video needs attention",
  deleting: "Deleting video",
  deleted: "Video deleted",
};
function videoProgressLabel(stage?: string) {
  return stage
    ? (
        {
          V3_FINAL_VIDEO_JOB_CLAIMED: "Preparing video generation",
          HIGGSFIELD_SUBMITTING: "Submitting video request",
          HIGGSFIELD_REQUEST_ACCEPTED: "Video request accepted",
          HIGGSFIELD_PROCESSING: "Generating video",
          HIGGSFIELD_RESULT_RECEIVED: "Downloading and checking video",
          V3_FINAL_VIDEO_SAVED: "Preparing saved video preview",
          V3_FINAL_VIDEO_READY_FOR_REVIEW: "Ready for review",
        } as Record<string, string>
      )[stage]
    : undefined;
}
const taskLabels: Record<string, string> = {
  character: "Character",
  product: "Product / Prop",
  location: "Location",
  storyboard: "Storyboard",
  package: "Generation Package",
  video: "Final Video",
  delete: "Deleting saved work",
  join: "Finishing video",
};
type Action = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<boolean>;
function ReferenceTechnicalDetails({
  task,
}: {
  task: RuntimeDto["tasks"][number];
}) {
  const d = task.diagnostics;
  if (!d) return null;
  const yesNo = (value: boolean) => (value ? "Yes" : "No");
  const fields = {
    Provider: d.provider,
    Model: d.model ?? "Not recorded",
    "Task ID": task.id,
    Stage: d.stage,
    "HTTP status": d.httpStatus ?? "Not recorded",
    "Error code": d.errorCode ?? "None recorded",
    "Request ID": d.requestId ?? "Not recorded",
    "Provider code": d.providerCode ?? "Not recorded",
    "Response saved": yesNo(d.responseSaved),
    "Image saved": yesNo(d.imageSaved),
    "Recovery available": yesNo(d.recoveryAvailable),
  };
  return (
    <details className="text-xs text-muted-foreground">
      <summary className="cursor-pointer">Technical details</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {Object.entries(fields).map(([label, value]) => (
          <div key={label} className="contents">
            <dt>{label}</dt>
            <dd className="min-w-0 break-all">{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
function PackageStatus({
  task,
  technical,
}: {
  task: RuntimeDto["tasks"][number];
  technical: boolean;
}) {
  const d = task.packageBuild;
  if (!d) return null;
  return (
    <div className="space-y-2 text-sm">
      <p role="status">{packageBuildLabel(d, task.status)}</p>
      {d.code && (
        <p role="alert" className="text-destructive">
          {packageBuildError(d.code)}
        </p>
      )}
      {technical && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            Package technical details
          </summary>
          <dl className="mt-2 space-y-1">
            {Object.entries({
              Stage: d.stage,
              Code: d.code ?? "None",
              "HTTP status": d.httpStatus ?? "Not recorded",
              "Package ID": d.packageId,
              "Segment ID": d.segmentId ?? "Not assigned",
              "Estimate status": d.estimateStatus,
              Recoverable: d.recoverable ? "Yes" : "No",
            }).map(([label, value]) => (
              <div key={label} className="break-all">
                <dt className="inline font-medium">{label}: </dt>
                <dd className="inline">{value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}
function VideoReview({
  run,
  act,
  busy,
  segmentCount,
}: {
  run: RuntimeDto["runs"][number];
  act: Action;
  busy: boolean;
  segmentCount: number;
}) {
  const panels = useStudioPanels();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [quality, setQuality] = useState<Quality>({
    ...uncheckedQuality,
    ...(run.expectedDialogue.length
      ? {}
      : {
          dialoguePresence: "not_applicable",
          speechTiming: "not_applicable",
          lipAudioSync: "not_applicable",
        }),
  });
  const labels: Record<Exclude<keyof Quality, "notes">, string> = {
    characterContinuity: "Character continuity",
    productContinuity: "Product continuity",
    locationContinuity: "Location continuity",
    dialoguePresence: "Dialogue present",
    speechTiming: "Rough speech timing",
    lipAudioSync: "Visible lip/audio synchronization",
    visualQuality: "Visual quality",
  };
  return (
    <section
      className="space-y-3 rounded-xl border border-border p-4"
      aria-label="Final video review"
    >
      <h2 className="font-semibold">
        {run.state === "awaiting_review"
          ? segmentCount > 1 && run.segmentId !== "joined"
            ? "Segment ready for review"
            : "Final Video ready"
          : videoStateLabels[run.state]}
      </h2>
      <p role="status" className="text-sm text-muted-foreground">
        {["queued", "submitting", "provider_processing"].includes(run.state)
          ? (videoProgressLabel(run.stage?.stage) ??
            videoStateLabels[run.state])
          : videoStateLabels[run.state]}
      </p>
      {run.preview && (
        <Button
          variant="outline"
          onClick={() => panels?.selectMedia(`v3-video:${run.id}`)}
        >
          View in Preview
        </Button>
      )}
      <p className="text-sm text-muted-foreground">
        Actual duration:{" "}
        {run.actualDurationMs === null
          ? "Not measured"
          : `${run.actualDurationMs / 1000}s`}
        . Audio:{" "}
        {run.hasAudio === null
          ? "Not measured"
          : run.hasAudio
            ? "Present"
            : "Absent"}
        .
      </p>
      <p className="text-sm text-muted-foreground">
        {run.aspectRatio} · {run.resolution} · {run.provider} · {run.model}
      </p>
      <p className="text-sm text-muted-foreground">
        Estimated cost: ~
        {money(run.displayEstimatedCostMicrousd ?? run.estimatedCostMicrousd)}.
        Actual provider cost:{" "}
        {run.actualCostMicrousd === null
          ? "Unknown"
          : money(run.actualCostMicrousd)}
        .
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer">
          Expected dialogue and shot timing
        </summary>
        <ul className="mt-2 space-y-1">
          {run.expectedDialogue.map((line, i) => (
            <li key={i}>
              {line.startMs / 1000}–{line.endMs / 1000}s · {line.speaker}:{" "}
              {line.text}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          {run.shotTimings
            .map(
              (s) => `Shot ${s.number}: ${s.startMs / 1000}–${s.endMs / 1000}s`,
            )
            .join("; ")}
        </p>
        <p className="mt-2 text-muted-foreground">
          These are intended timings. Review the actual words, sound, visible
          performance and continuity.
        </p>
      </details>
      {run.state === "awaiting_review" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(labels).map(([key, label]) => (
              <label key={key} className="space-y-1 text-sm">
                {label}
                <select
                  className={field}
                  value={quality[key as Exclude<keyof Quality, "notes">]}
                  onChange={(e) =>
                    setQuality((q) => ({ ...q, [key]: e.target.value }))
                  }
                >
                  <option value="not_checked">Not checked</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  {[
                    "productContinuity",
                    "dialoguePresence",
                    "speechTiming",
                    "lipAudioSync",
                  ].includes(key) && (
                    <option value="not_applicable">Not applicable</option>
                  )}
                </select>
              </label>
            ))}
          </div>
          <label className="block space-y-1 text-sm">
            Review notes
            <textarea
              className={field}
              maxLength={4000}
              value={quality.notes}
              onChange={(e) =>
                setQuality((q) => ({ ...q, notes: e.target.value }))
              }
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy || !run.current}
              onClick={() => void act("approve", { id: run.id, quality })}
            >
              {segmentCount > 1 && run.segmentId !== "joined"
                ? "Approve Segment"
                : "Approve Final Video"}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              Reject and Delete
            </Button>
          </div>
          <Dialog
            open={confirmDelete}
            onOpenChange={(open) => {
              if (!busy) setConfirmDelete(open);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this Final Video?</DialogTitle>
                <DialogDescription>
                  This permanently deletes the saved video and local candidate
                  copies. Generating another video requires a new approval and
                  an explicit Generate action.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void act("reject_delete", {
                      id: run.id,
                      quality,
                      confirmedDeletion: true,
                    }).then((ok) => {
                      if (ok) setConfirmDelete(false);
                    })
                  }
                >
                  Reject and Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
      {run.state === "deleted" && (
        <p className="text-sm">
          Video deleted. Review and approve the Generation Package again, then
          choose Generate Final Video.
        </p>
      )}
      {run.errorCode === "OUTPUT_HOST_APPROVAL_REQUIRED" && (
        <div role="status" className="space-y-1 text-sm">
          <p>
            The video is generated. Its download host needs approval before
            saving.
          </p>
          {run.outputHostname && (
            <details>
              <summary className="cursor-pointer">
                Local output host approval
              </summary>
              <p className="break-all">Hostname: {run.outputHostname}</p>
              <p>
                Verify this host, add it exactly to
                UGC_V3_HIGGSFIELD_OUTPUT_HOSTS, restart the local worker, and
                recover this saved request.
              </p>
            </details>
          )}
          <p>Recovery will not submit another generation request.</p>
        </div>
      )}
      {["reconciliation_required", "provider_processing", "deleting"].includes(
        run.state,
      ) && (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void act("recover", { id: run.id })}
        >
          {run.state === "deleting" ? "Retry deletion" : "Recover saved work"}
        </Button>
      )}
      {run.errorCode && run.errorCode !== "OUTPUT_HOST_APPROVAL_REQUIRED" && (
        <p role="status" className="break-words text-sm text-muted-foreground">
          {run.errorCode === "V3_PROVIDER_OUTCOME_UNKNOWN"
            ? "Submission outcome is unknown. This request will not be submitted again automatically; reconcile its provider outcome before taking another paid action."
            : "This saved work needs attention. Check status or recover the saved result."}
        </p>
      )}
    </section>
  );
}
export function V3WorkflowPreview({
  initial,
  projectId,
  assets,
  dirty,
  revision,
}: {
  initial?: RuntimeDto;
  projectId: string;
  assets: ProjectAsset[];
  dirty: boolean;
  revision: string;
}) {
  const [workspace, setWorkspace] = useState(initial ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [buildActionFailure, setBuildActionFailure] = useState<{
    code: string;
    httpStatus: number | null;
  } | null>(null);
  const [maximum, setMaximum] = useState<{
      packageHash: string;
      value: string;
    } | null>(null),
    [approvedHash, setApprovedHash] = useState<string | null>(null);
  const refreshLock = useRef(false),
    refreshRequested = useRef(false);
  const actionLock = useRef(false);
  const [regeneration, setRegeneration] = useState<{
    kind: "character" | "product";
    id: string;
    version: number;
  } | null>(null);
  const panels = useStudioPanels();
  const [actionArea, setActionArea] = useState<string>("workflow");
  const [view, setView] = useState<
    "progress" | "storyboard" | "package" | "final"
  >("progress");
  const [showLocationFeedback, setShowLocationFeedback] = useState(false);
  const previewMedia = useMemo<StudioPreviewMedia[]>(
    () => [
      ...(workspace?.artifacts
        .filter(
          (a) =>
            ["character", "product", "location"].includes(a.kind) &&
            !a.rejected &&
            !a.cleanupPending &&
            a.preview,
        )
        .map((a) => ({
          id: "v3-reference:" + a.id,
          label:
            (a.kind === "character"
              ? "Character Sheet"
              : a.kind === "product"
                ? "Product Sheet"
                : "Location"),
          kind: "image" as const,
          src: a.preview!,
        })) ?? []),
      ...(workspace?.runs
        .filter(
          (r) => r.preview && r.state !== "deleted" && r.state !== "deleting",
        )
        .map((r) => ({
          id: "v3-video:" + r.id,
          label: r.segmentId === "joined" ? "Final Video" : "Generated Video",
          kind: "video" as const,
          src: r.preview!,
        })) ?? []),
    ],
    [workspace],
  );
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!projectId) return;
      if (refreshLock.current) {
        refreshRequested.current = true;
        return;
      }
      refreshLock.current = true;
      try {
        do {
          refreshRequested.current = false;
          const response = await fetch(
            `/api/ugc/v3?project=${encodeURIComponent(projectId)}`,
            { cache: "no-store", signal },
          );
          const body = await response.json();
          if (!body.ok) throw new Error(body.code);
          if (!signal?.aborted) setWorkspace(body.workspace);
        } while (refreshRequested.current && !signal?.aborted);
      } catch (e) {
        if (!signal?.aborted)
          setError(e instanceof Error ? e.message : "V3_STATUS_UNAVAILABLE");
      } finally {
        refreshLock.current = false;
      }
    },
    [projectId],
  );
  useEffect(() => {
    const timer = setTimeout(() => {
      void refresh();
    }, 0);
    return () => clearTimeout(timer);
  }, [refresh, revision]);
  const processing =
    !!workspace?.processing || !!workspace?.referenceCleanup?.processing;
  useEffect(() => {
    if (!projectId || !processing) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(tick, 3000);
    };
    timer = setTimeout(tick, 3000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, processing, refresh]);
  const act: Action = async (action, payload = {}) => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setBusy(true);
    setError("");
    const area =
      payload.kind ??
      workspace?.artifacts.find((a) => a.id === payload.id)?.kind ??
      workspace?.tasks.find((t) => t.id === payload.id)?.kind;
    setActionArea(
      typeof area === "string" &&
        ["character", "product", "location"].includes(area)
        ? area
        : "workflow",
    );
    if (action === "build_package") setBuildActionFailure(null);
    try {
      const id = projectId;
      const response = await fetch("/api/ugc/v3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectId: id, ...payload }),
      });
      const body = await response.json();
      if (!body.ok) {
        if (action === "build_package")
          setBuildActionFailure({
            code: body.code,
            httpStatus: response.status,
          });
        throw new Error(body.code);
      }
      setWorkspace(body.workspace);
      if (action === "build_package") setApprovedHash(null);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "V3_ACTION_UNAVAILABLE");
      return false;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const p = workspace?.preflight;
  const maximumValue =
    p && maximum?.packageHash === p.packageHash
      ? maximum.value
      : p?.suggestedMaximumMicrousd
        ? (p.suggestedMaximumMicrousd / 1_000_000).toFixed(2)
        : "";
  const packageTask = workspace?.tasks
    .filter((t) => t.kind === "package")
    .at(-1);
  const locked = busy || dirty || !!workspace?.processing;
  const reference = (kind: "character" | "product") =>
    assets.find(
      (a) =>
        a.studioRole === kind && a.status === "uploaded" && !a.removedFromDraft,
    );
  const latest = workspace?.artifacts.filter((a) => a.activeSlot) ?? [];
  const failedReference = (kind: "character" | "product") =>
    workspace?.tasks.filter((t) => t.kind === kind).at(-1);
  const referencePayload = (kind: "character" | "product") => {
    const prior = failedReference(kind);
    return {
      kind,
      assetId: reference(kind)?.id,
      ...(prior?.canStartNew && prior.providerStarted
        ? { confirmNewRequest: true, failedTaskId: prior.id }
        : {}),
    };
  };
  const requestReference = (kind: "character" | "product") => {
    const current = latest.find((a) => a.kind === kind);
    if (current) {
      setError("");
      setRegeneration({ kind, id: current.id, version: current.version });
    } else void act("reference", referencePayload(kind));
  };
  const continueRegeneration = async () => {
    if (!regeneration || busy || dirty || actionLock.current) return;
    const ok = await act("reference", {
      ...referencePayload(regeneration.kind),
      confirmedDeletion: true,
      expectedId: regeneration.id,
      expectedVersion: regeneration.version,
    });
    if (ok) setRegeneration(null);
  };
  const currentApproved = (kind: string) =>
    latest.some(
      (a) => a.kind === kind && a.current && a.approved && !a.rejected,
    );
  const referencesComplete = !!workspace && !locationReferenceFeedback(workspace.artifacts, {
    character: !!reference("character"), product: !!reference("product"),
  }) && currentApproved("location");
  const selectStoryboard = useCallback(() => setView("storyboard"), []);
  const locationFeedback = locationReferenceFeedback(workspace?.artifacts ?? [], {
    character: !!reference("character"), product: !!reference("product"),
  });
  const sourcePanel = (kind: "character" | "product" | "location") => {
    const label =
      kind === "character"
        ? "Character Sheet"
        : kind === "product"
          ? "Product Sheet"
          : "Location";
    const task = workspace?.tasks.filter((t) => t.kind === kind).at(-1);
    const current = latest.find((a) => a.kind === kind && !a.rejected);
    const history =
      workspace?.artifacts.filter(
        (a) =>
          a.kind === kind &&
          a.approved &&
          !a.rejected &&
          !latest.some((n) => n.id === a.id),
      ) ?? [];
    const image = (a: NonNullable<typeof current>) =>
      a.preview && !a.cleanupPending ? (
        <button
          type="button"
          aria-label={"Preview " + label + " version " + a.version}
          className="block w-full cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => panels?.selectMedia("v3-reference:" + a.id)}
        >
          <Image
            unoptimized
            width={1024}
            height={1024}
            src={a.preview}
            alt={label}
            className="max-h-48 w-full rounded-lg object-contain"
          />
        </button>
      ) : null;
    const generationButton = kind === "location" ? (
      <Button variant={current ? "default" : "outline"}
        disabled={locked || (!!workspace && referenceBusy(workspace.tasks, "location"))}
        aria-disabled={!!locationFeedback}
        className="aria-disabled:cursor-not-allowed aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:opacity-60"
        onClick={() => {
          if (locationFeedback) { setShowLocationFeedback(true); return; }
          const current = latest.find(a => a.kind === "location");
          void act("reference", { kind: "location", expectedId: current?.id, expectedVersion: current?.version });
        }}>{current ? "Regenerate Location" : "Generate Location"}</Button>
    ) : <Button variant={current ? "default" : "outline"}
      disabled={!workspace || busy || dirty || referenceBusy(workspace.tasks, kind) || !reference(kind)}
      onClick={() => requestReference(kind)}>{current ? "Regenerate" : "Generate"} {label}</Button>;
    return (
      <StudioPanelPortal key={kind} panel={kind}>
        <section
          className="space-y-2 text-xs [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:text-xs [&_button]:h-auto [&_button]:min-h-8 [@media(pointer:coarse)]:[&_button]:min-h-11"
          aria-label={label}
          aria-busy={
            (busy && actionArea === kind) ||
            (!!task && ["queued", "running"].includes(task.status))
          }
        >
          {kind === "location" && (
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Location
            </h3>
          )}
          {!current && generationButton}
          {kind === "location" && showLocationFeedback && locationFeedback && (
            <p role="status" aria-live="polite" className="text-muted-foreground">{locationFeedback}</p>
          )}
          {kind !== "location" && current && (
            <h4 className="font-medium">{label}</h4>
          )}
          {dirty && (kind === "location" || reference(kind)) && (
            <p role="status" className="text-muted-foreground">
              Save changes to generate or approve.
            </p>
          )}
          {!workspace && (
            <p role="status" className="text-muted-foreground">
              Loading references…
            </p>
          )}
          {busy && actionArea === kind && (
            <p role="status" className="text-muted-foreground">
              Preparing your request…
            </p>
          )}
          {error && actionArea === kind && (
            <p role="alert" className="break-words text-destructive">
              {v3ActionErrorMessage(error)}
            </p>
          )}
          {task && ["queued", "running"].includes(task.status) && (
            <p role="status" className="text-muted-foreground">
              {task.location?.label ??
                label +
                  ": " +
                  (task.status === "queued" ? "Waiting" : "Generating…")}
            </p>
          )}
          {task &&
            !task.current &&
            task.status === "queued" &&
            !task.providerStarted && (
              <p role="status" className="text-warning-foreground">
                Inputs changed. Generate again to replace the unstarted request.
              </p>
            )}
          {task &&
            ["failed", "reconciliation_required"].includes(task.status) &&
            !task.diagnostics &&
            !task.location && (
              <p role="status" className="text-destructive">
                {v3ActionErrorMessage(task.errorCode ?? "V3_TASK_FAILED")}
              </p>
            )}
          {kind !== "location" && task?.diagnostics && (
            <div className="space-y-2">
              <p role="status" className="text-muted-foreground">
                {referenceFailureLabel(kind, task.diagnostics)}
              </p>
              {task.canStartNew && (
                <p className="text-muted-foreground">
                  Generate starts a new request. The previous provider outcome
                  may be unconfirmed.
                </p>
              )}
              {task.recoveryAvailable && (
                <Button
                  variant="outline"
                  disabled={busy || !task.current}
                  onClick={() => void act("recover_task", { id: task.id })}
                >
                  Recover saved response
                </Button>
              )}
              {workspace?.localEnabled && (
                <ReferenceTechnicalDetails task={task} />
              )}
            </div>
          )}
          {kind === "location" && (
            <V3LocationStatus task={task} busy={busy} dirty={dirty} act={act} />
          )}
          {current && (
            <article className="space-y-2">
              {image(current)}
              {generationButton}
              {current.cleanupPending ? (
                <div className="space-y-2">
                  <p role="status">Deletion pending</p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        (current.kind === "character" ||
                          current.kind === "product") &&
                        current.cleanupMode === "regenerate"
                      )
                        requestReference(current.kind);
                      else
                        void act(
                          current.kind === "location"
                            ? "discard_reference"
                            : "review_artifact",
                          {
                            id: current.id,
                            kind: current.kind,
                            expectedVersion: current.version,
                            decision: "reject",
                          },
                        );
                    }}
                  >
                    Retry deletion
                  </Button>
                </div>
              ) : !current.current ? (
                <div className="space-y-2">
                  <p role="status" className="text-warning-foreground">
                    {current.kind === "character" || current.kind === "product"
                      ? "Visual Style or source changed — regenerate and approve this sheet."
                      : "Stale — regenerate and approve."}
                  </p>
                  {(current.kind === "character" || current.kind === "product") && (
                    <Button variant="outline" disabled={busy} onClick={() => void act("review_artifact", {
                      id: current.id, kind: current.kind, expectedVersion: current.version, decision: "reject",
                    })}>Reject and Delete</Button>
                  )}
                  {current.kind === "location" && !current.approved && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void act("discard_reference", {
                          id: current.id,
                          expectedVersion: current.version,
                        })
                      }
                    >
                      Reject and Delete
                    </Button>
                  )}
                </div>
              ) : current.approved ? null : (
                <>
                  <p role="status" className="text-muted-foreground">
                    Ready for review
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      disabled={locked || !current.current}
                      onClick={() =>
                        void act("review_artifact", {
                          id: current.id,
                          decision: "approve",
                        })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        void act("review_artifact", {
                          id: current.id,
                          kind: current.kind,
                          expectedVersion: current.version,
                          decision: "reject",
                        })
                      }
                    >
                      {current.kind === "location"
                        ? "Reject and Delete"
                        : "Reject"}
                    </Button>
                  </div>
                </>
              )}
            </article>
          )}
          {history.length > 0 && (
            <details>
              <summary className="cursor-pointer text-muted-foreground">
                Earlier sheets
              </summary>
              <div className="mt-2 space-y-3">
                {history.map((a) => (
                  <article key={a.id} className="space-y-1">
                    {image(a)}
                  </article>
                ))}
              </div>
            </details>
          )}
          {kind === "location" &&
            !!workspace?.referenceCleanup?.pendingCount && (
              <div className="space-y-2 text-muted-foreground">
                <p>
                  {workspace.referenceCleanup.enabled
                    ? "Unwanted images pending deletion."
                    : "Image cleanup needs database setup."}
                </p>
                {workspace.tasks
                  .filter((t) => t.referenceCleanup && t.status === "failed")
                  .map((t) => (
                    <p key={t.id} role="alert">
                      {v3ActionErrorMessage(
                        t.errorCode ?? "V3_REFERENCE_DISCARD_STORAGE_FAILED",
                      )}
                    </p>
                  ))}
                <Button
                  variant="outline"
                  disabled={busy || !workspace.referenceCleanup.enabled}
                  onClick={() => void act("cleanup_references")}
                >
                  Retry image cleanup
                </Button>
              </div>
            )}
        </section>
      </StudioPanelPortal>
    );
  };
  return (
    <>
      <StudioWorkflowMedia media={previewMedia} />
      <StudioWorkflowGuidance projectId={projectId} ready={!!workspace} referencesComplete={referencesComplete}
        complete={!!workspace?.complete} selectStoryboard={selectStoryboard} />
      <ReferenceRegenerationDialog
        kind={regeneration?.kind ?? null}
        busy={busy}
        blocked={dirty}
        error={
          error
            ? v3ActionErrorMessage(error)
            : dirty
              ? "Save your Studio changes before continuing."
              : ""
        }
        onCancel={() => setRegeneration(null)}
        onContinue={continueRegeneration}
      />
      {(["character", "product", "location"] as const).map(sourcePanel)}
      <StudioPanelPortal panel="workflow">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col gap-3"
          aria-busy={busy}
        >
          <div
            className="flex shrink-0 flex-wrap items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5"
            role="group"
            aria-label="Workflow view"
          >
            {(["progress", "storyboard", "package", "final"] as const).map(
              (item) => (
                <button
                  type="button"
                  key={item}
                  aria-pressed={view === item}
                  onClick={() => setView(item)}
                  className={
                    "min-h-9 cursor-pointer rounded px-2.5 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 " +
                    (view === item
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground")
                  }
                >
                  {item === "progress"
                    ? "Progress"
                    : item === "storyboard"
                      ? "Storyboard"
                      : item === "package"
                        ? "Package"
                        : "Final Video"}
                </button>
              ),
            )}
          </div>
          <div className="min-h-0 min-w-0 space-y-4 break-words">
            {dirty && (
              <p role="status" className="text-sm text-warning-foreground">
                Save changes before generating or approving.
              </p>
            )}
            {busy && actionArea === "workflow" && (
              <p role="status" className="text-sm text-muted-foreground">
                Preparing your request…
              </p>
            )}
            {error && actionArea === "workflow" && (
              <p
                role="alert"
                className="break-words rounded-lg border border-destructive/30 p-3 text-sm"
              >
                {/PACKAGE|STORYBOARD|APPROV/.test(error)
                  ? packageBuildError(error)
                  : v3ActionErrorMessage(error)}
              </p>
            )}
            {!workspace ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading generation status…
              </p>
            ) : (
              <>
                {view !== "storyboard" && <div className="flex flex-wrap items-center justify-between gap-2">
                  <p role="status" className="text-sm text-muted-foreground">
                    {v3ProgressLabel(workspace, !!reference("product"))}
                  </p>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void refresh()}
                  >
                    Check status
                  </Button>
                </div>}
                {view === "storyboard" && (
                  <section className="space-y-3">
                    <h2 className="font-semibold">Storyboard</h2>
                    <Button
                      variant="default"
                      disabled={
                        locked ||
                        !currentApproved("character") ||
                        !currentApproved("location") ||
                        (!!reference("product") && !currentApproved("product"))
                      }
                      onClick={() => void act("storyboard")}
                    >
                      Generate Storyboard
                    </Button>
                    {workspace.artifacts
                      .filter(
                        (a) =>
                          a.storyboard &&
                          !a.rejected &&
                          !workspace.artifacts.some(
                            (n) => n.kind === a.kind && n.version > a.version,
                          ),
                      )
                      .map((a) => (
                        <article
                          key={a.id}
                          className="space-y-3 rounded-xl border border-border p-4"
                        >
                          <V3StoryboardContent storyboard={a.storyboard!} />
                          {!a.current ? (
                            <p
                              role="status"
                              className="text-sm text-warning-foreground"
                            >
                              Storyboard is stale. Regenerate after approving
                              current references.
                            </p>
                          ) : a.approved ? (
                            <p className="text-sm">Storyboard approved</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={locked || !a.current}
                                onClick={() =>
                                  void act("review_artifact", {
                                    id: a.id,
                                    decision: "approve",
                                  })
                                }
                              >
                                Approve Storyboard
                              </Button>
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() =>
                                  void act("review_artifact", {
                                    id: a.id,
                                    decision: "reject",
                                  })
                                }
                              >
                                Reject Storyboard
                              </Button>
                            </div>
                          )}
                        </article>
                      ))}
                  </section>
                )}
                {view === "package" && (
                  <section className="space-y-3 rounded-xl border border-border p-4">
                    <h2 className="font-semibold">Generation Package</h2>
                    {workspace.packageStale && (
                      <p
                        role="status"
                        className="text-sm text-warning-foreground"
                      >
                        This package needs rebuilding. Regenerate and approve
                        references and Storyboard for your saved style and
                        direction first.
                      </p>
                    )}
                    <Button
                      variant="outline"
                      disabled={locked || !currentApproved("storyboard")}
                      onClick={() =>
                        void act("build_package", {
                          retryTaskId: packageTask?.id,
                        })
                      }
                    >
                      Build package and estimate
                    </Button>
                    {buildActionFailure && workspace.localEnabled && (
                      <details className="text-xs text-muted-foreground">
                        <summary className="cursor-pointer">
                          Build request technical details
                        </summary>
                        <p>
                          Stage: validation · Code: {buildActionFailure.code} ·
                          HTTP status:{" "}
                          {buildActionFailure.httpStatus ?? "Not received"}
                        </p>
                        <p>
                          Package ID: Not assigned · Segment ID: Not assigned ·
                          Estimate status: Not requested · Recoverable: No
                        </p>
                      </details>
                    )}
                    {packageTask && (
                      <PackageStatus
                        task={packageTask}
                        technical={workspace.localEnabled}
                      />
                    )}
                    {p && (
                      <>
                        <p className="text-sm">
                          {p.durationMs / 1000}s · {p.aspectRatio} ·{" "}
                          {p.currentness === "current"
                            ? "Ready for review"
                            : "Needs rebuilding"}
                        </p>
                        <p className="text-sm">
                          Estimated video cost:{" "}
                          {(p.displayEstimatedCostMicrousd ??
                            p.estimatedCostMicrousd) === null
                            ? "Unavailable"
                            : `~${money(p.displayEstimatedCostMicrousd ?? p.estimatedCostMicrousd)}`}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Approximate Sceenyk estimate based on the configured
                          Higgsfield model rate. The real provider charge may
                          differ.
                        </p>
                        {p.segmentCount > 1 && (
                          <ul className="space-y-1 text-sm">
                            {p.segments.map((s, i) => (
                              <li key={s.id}>
                                Segment {i + 1} · {s.durationMs / 1000}s: ~
                                {money(
                                  s.displayEstimatedCostMicrousd ??
                                    s.estimatedCostMicrousd,
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-sm">
                          Authorized maximum:{" "}
                          {money(p.authorizedMaximumMicrousd)}
                        </p>
                        <label className="block space-y-1 text-sm">
                          Maximum authorized USD
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={field}
                            value={maximumValue}
                            onChange={(e) =>
                              setMaximum({
                                packageHash: p.packageHash,
                                value: e.target.value,
                              })
                            }
                          />
                        </label>
                        <p className="text-xs text-muted-foreground">
                          The suggested maximum includes a configurable{" "}
                          {p.suggestedAuthorizationBufferPercent}% buffer.
                          Review or edit it before approving; it is a spending
                          limit, not a guaranteed charge.
                        </p>
                        <label className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={approvedHash === p.packageHash}
                            onChange={(e) =>
                              setApprovedHash(
                                e.target.checked ? p.packageHash : null,
                              )
                            }
                          />
                          I reviewed this exact package and approve the
                          displayed request and cost limit.
                        </label>
                        <Button
                          variant="outline"
                          disabled={
                            locked ||
                            p.estimatedCostMicrousd === null ||
                            !p.quoteId ||
                            approvedHash !== p.packageHash ||
                            !maximumValue
                          }
                          onClick={() =>
                            void act("authorize", {
                              operatorApproved: true,
                              packageId: p.packageId,
                              packageHash: p.packageHash,
                              quoteId: p.quoteId,
                              maximumMicrousd: Math.round(
                                Number(maximumValue) * 1_000_000,
                              ),
                            })
                          }
                        >
                          Approve Generation Package
                        </Button>
                        {p.authorizationState === "bound" && (
                          <p role="status" className="text-sm">
                            Generation Package approved. Final Video is the next
                            stage.
                          </p>
                        )}
                        {p.issues.length > 0 && (
                          <p
                            role="status"
                            className="text-sm text-muted-foreground"
                          >
                            Video generation is awaiting setup or approval.
                          </p>
                        )}
                        {!p.transportEnabled && (
                          <p className="text-sm text-muted-foreground">
                            Video generation is currently unavailable. Your
                            saved work is preserved.
                          </p>
                        )}
                        <Button
                          disabled={locked || !p.canSubmit}
                          onClick={() =>
                            void act("generate", {
                              packageId: p.packageId,
                              packageHash: p.packageHash,
                            })
                          }
                        >
                          Generate Final Video
                        </Button>
                      </>
                    )}
                  </section>
                )}
                {view === "progress" && packageTask && (
                  <PackageStatus
                    task={packageTask}
                    technical={workspace.localEnabled}
                  />
                )}
                {view === "progress" &&
                  workspace.tasks
                    .filter(
                      (t) =>
                        t.kind !== "package" &&
                        t.status !== "done" &&
                        t.errorCode !== "V3_REFERENCE_REQUEST_SUPERSEDED" &&
                        (!["character", "product", "location"].includes(
                          t.kind,
                        ) ||
                          workspace.tasks
                            .filter((n) => n.kind === t.kind)
                            .at(-1)?.id === t.id),
                    )
                    .map((t) => (
                      <div key={t.id} className="space-y-1">
                        <p
                          role="status"
                          className="text-sm text-muted-foreground"
                        >
                          {t.referenceCleanup
                            ? t.status === "failed"
                              ? "Unwanted image deletion failed"
                              : "Deleting unwanted reference image"
                            : t.location
                              ? ["failed", "reconciliation_required"].includes(
                                  t.status,
                                )
                                ? t.location.failureLabel
                                : t.location.label
                              : t.diagnostics
                                ? referenceFailureLabel(t.kind, t.diagnostics)
                                : `${taskLabels[t.kind]}: ${t.status === "queued" ? "Waiting" : t.status === "running" ? "Preparing" : "Recovery required"}`}
                        </p>
                        {((!t.location && t.recoveryAvailable) ||
                          (t.status === "reconciliation_required" &&
                            t.kind === "storyboard")) && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void act("recover_task", { id: t.id })
                            }
                          >
                            Recover saved response
                          </Button>
                        )}
                        {t.kind === "join" && t.status === "failed" && (
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void act("recover_task", { id: t.id })
                            }
                          >
                            Recover local join
                          </Button>
                        )}
                      </div>
                    ))}
                {view === "final" &&
                  workspace.runs
                    .filter((r) => !p || r.packageId === p.packageId)
                    .map((r) => (
                      <VideoReview
                        key={r.id}
                        run={r}
                        act={act}
                        busy={locked}
                        segmentCount={p?.segmentCount ?? 1}
                      />
                    ))}
                {view === "final" &&
                  p &&
                  !workspace.runs.some(
                    (r) => r.packageId === p.packageId && r.state !== "deleted",
                  ) && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={locked}
                        onClick={() => setView("package")}
                      >
                        Review Generation Package
                      </Button>
                      <Button
                        disabled={locked || !p.canSubmit}
                        onClick={() =>
                          void act("generate", {
                            packageId: p.packageId,
                            packageHash: p.packageHash,
                          })
                        }
                      >
                        Generate Final Video
                      </Button>
                    </div>
                  )}
                {view === "final" &&
                  p &&
                  workspace.runs.some((r) => r.packageId !== p.packageId) && (
                    <details className="space-y-3">
                      <summary className="cursor-pointer text-sm">
                        Earlier attempts and saved work
                      </summary>
                      {workspace.runs
                        .filter((r) => r.packageId !== p.packageId)
                        .map((r) => (
                          <VideoReview
                            key={r.id}
                            run={r}
                            act={act}
                            busy={locked}
                            segmentCount={1}
                          />
                        ))}
                    </details>
                  )}
                {workspace.complete && (
                  <p role="status" className="font-semibold">
                    Complete
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </StudioPanelPortal>
    </>
  );
}
