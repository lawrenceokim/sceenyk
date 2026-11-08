"use client";
import { V3LocationStatus } from "./v3-location-status";
import { V3StoryboardContent } from "./v3-storyboard-content";
import { V3StoryboardSkeleton } from "./v3-storyboard-skeleton";
import { V3PackageSkeleton } from "./v3-package-skeleton";
import { V3WorkflowProgress } from "./v3-workflow-progress";
import { V3ClipManager } from "./v3-clip-manager";
import { FinalVideoGenerate, FinalVideoReview } from "./v3-final-video-controls";
import { finalVideoPresentation } from "./v3-final-video-state";
import { shouldPollV3Video } from "@/lib/final-video-generation-v3/video-progress";
import { StudioWorkflowGuidance } from "./studio-workflow-guidance";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { CircleCheck, Clock3, Info, Layers2, Ratio, RefreshCw, Smartphone } from "lucide-react";
import {
  StudioPanelPortal,
  StudioWorkflowMedia,
  useStudioPanels,
  type StudioPreviewMedia,
} from "./studio-workspace-panels";
import { Button } from "@/components/ui/button";
import type { ProjectAsset } from "@/lib/media/types";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { referenceBusy } from "@/lib/final-video-generation-v3/progress";
import { v3ActionErrorMessage } from "@/lib/final-video-generation-v3/reference-errors";
import { ReferenceRegenerationDialog } from "./reference-regeneration-dialog";
import { useStudioMode } from "@/components/workspace/studio-mode-provider";
import { referenceFailureLabel } from "@/lib/final-video-generation-v3/reference-status";
import { locationReferenceFeedback } from "@/lib/final-video-generation-v3/reference-prerequisites";
import {
  packageBuildLabel,
  packageBuildError,
} from "@/lib/final-video-generation-v3/package-status";

const money = (amount: number | null) => {
  if (amount === null) return "Unavailable";
  const cents = (BigInt(amount) + BigInt(5000)) / BigInt(10000);
  return `$${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
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
  const [statusError, setStatusError] = useState("");
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
  const workspaceVersion = useRef(0);
  const [regeneration, setRegeneration] = useState<{
    assetId?: string;
    kind: "character" | "product";
    id: string;
    version: number;
  } | null>(null);
  const panels = useStudioPanels();
  const { mode: studioMode } = useStudioMode();
  const characterAssets = assets.filter(a => a.studioRole === "character" && a.status === "uploaded" && !a.removedFromDraft);
  const characterPanels = studioMode === "pro" || characterAssets.length > 1;
  const proCharactersBlocked = studioMode !== "pro" && characterAssets.length > 1;
  const [actionArea, setActionArea] = useState<string>("workflow");
  const [view, setView] = useState<
    "progress" | "storyboard" | "package" | "final"
  >("progress");
  const [showLocationFeedback, setShowLocationFeedback] = useState(false);
  const [storyboardRequestPending, setStoryboardRequestPending] = useState(false);
  const [packageRequestPending, setPackageRequestPending] = useState(false);
  const [videoRequestPending, setVideoRequestPending] = useState(false);
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
          label: r.segmentId === "joined" ? "Final Video" : workspace?.multiClip?.clips.find(c => c.runId === r.id) ? `Clip ${workspace.multiClip.clips.find(c => c.runId === r.id)!.number}` : "Generated Video",
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
          const version = workspaceVersion.current;
          const response = await fetch(
            `/api/ugc/v3?project=${encodeURIComponent(projectId)}`,
            { cache: "no-store", signal },
          );
          const body = await response.json();
          if (!body.ok) throw new Error(body.code);
          // An older status read must not overwrite a just-saved approval/action.
          if (!signal?.aborted && !actionLock.current && version === workspaceVersion.current) {
            setWorkspace(body.workspace);
            setStatusError("");
          }
        } while (refreshRequested.current && !signal?.aborted);
      } catch (e) {
        if (!signal?.aborted)
          setStatusError(e instanceof Error ? e.message : "V3_STATUS_UNAVAILABLE");
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
  useEffect(() => {
    // Review/terminal states have no polling timer. Returning to a retained page
    // still reads saved approvals or recoveries made in another window.
    const onReturn = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onReturn);
    window.addEventListener("pageshow", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      window.removeEventListener("pageshow", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [refresh]);
  const processing =
    !!workspace?.processing || !!workspace?.referenceCleanup?.processing || shouldPollV3Video(workspace?.runs ?? []);
  const pollingInterval = workspace?.runs.some(run => run.state === "reconciliation_required" || run.submissionBlocker) ? 10_000 : 3000;
  useEffect(() => {
    if (!projectId || !processing) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(tick, pollingInterval);
    };
    timer = setTimeout(tick, pollingInterval);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [projectId, processing, pollingInterval, refresh]);
  const act: Action = async (action, payload = {}) => {
    if (actionLock.current) return false;
    actionLock.current = true;
    setBusy(true);
    setError("");
    const area =
      payload.kind ??
      workspace?.artifacts.find((a) => a.id === payload.id)?.kind ??
      workspace?.tasks.find((t) => t.id === payload.id)?.kind;
    const characterId = payload.assetId ?? workspace?.artifacts.find(a => a.id === payload.id)?.characterId ?? workspace?.tasks.find(t => t.id === payload.id)?.characterId;
    setActionArea(
      typeof area === "string" &&
        ["character", "product", "location"].includes(area)
        ? area === "character" && characterPanels && characterId ? `character:${characterId}` : area
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
      workspaceVersion.current++;
      setWorkspace(body.workspace);
      setStatusError("");
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
  const workflowError = error || statusError;
  const maximumValue =
    p && maximum?.packageHash === p.packageHash
      ? maximum.value
      : p?.suggestedMaximumMicrousd
        ? (p.suggestedMaximumMicrousd / 1_000_000).toFixed(2)
        : "";
  const packageTask = workspace?.tasks
    .filter((t) => t.kind === "package")
    .at(-1);
  const packageLoading =
    !p &&
    !buildActionFailure &&
    (packageRequestPending ||
      (!!packageTask && ["queued", "running"].includes(packageTask.status)));
  const packageUpdating = packageRequestPending ||
    (!!packageTask && ["queued", "running"].includes(packageTask.status));
  const packageBuildFailed = !!buildActionFailure ||
    (!!packageTask && ["failed", "reconciliation_required"].includes(packageTask.status));
  // Presentation only: a saved estimate is distinct from video submission readiness.
  const packageReady = !!p && p.currentness === "current" && !workspace?.packageStale &&
    p.estimatedCostMicrousd !== null && !!p.quoteId && !packageUpdating && !packageBuildFailed &&
    !packageTask?.packageBuild?.code &&
    !p.issues.some(issue => ["COST_ESTIMATE_UNAVAILABLE", "V3_LOCAL_PRICING_SNAPSHOT_INVALID", "V3_RESOLUTION_PRICING_NOT_CONFIGURED"].includes(issue));
  const packageApproved = packageReady && p?.authorizationState === "bound" &&
    !p.issues.some(issue => issue.startsWith("V3_AUTHORIZATION_") || issue === "V3_SEGMENT_AUTHORIZATION_REQUIRED");
  const packageReviewLabel = packageReady
    ? packageApproved ? "Approved" : "Ready for review"
    : p?.currentness !== "current" || workspace?.packageStale ? "Needs rebuilding"
    : packageUpdating ? "Updating package"
    : packageBuildFailed ? "Build needs attention" : "Estimate unavailable";
  const storyboardTask = workspace?.tasks
    .filter((t) => t.kind === "storyboard")
    .at(-1);
  const artifacts = workspace?.artifacts ?? [];
  const storyboards = artifacts.filter(
    (a) =>
      a.storyboard &&
      !a.rejected &&
      !artifacts.some((n) => n.kind === a.kind && n.version > a.version),
  );
  const storyboardLoading =
    storyboards.length === 0 &&
    (storyboardRequestPending ||
      (!!storyboardTask &&
        ["queued", "running"].includes(storyboardTask.status) &&
        (storyboardTask.current || storyboardTask.providerStarted)));
  const locked = busy || dirty || !!workspace?.processing;
  const finalVideo = finalVideoPresentation(workspace, { dirty, busy, requestPending: videoRequestPending });
  const finalVideoGenerating = finalVideo.loading && (videoRequestPending || finalVideo.activeRuns.length > 0 || !!workspace?.tasks.some(t => t.kind === "join" && ["queued", "running"].includes(t.status)));
  const reference = (kind: "character" | "product", assetId?: string) =>
    assets.find(
      (a) =>
        a.studioRole === kind && (!assetId || a.id === assetId) && a.status === "uploaded" && !a.removedFromDraft,
    );
  const latest = workspace?.artifacts.filter((a) => a.activeSlot) ?? [];
  const failedReference = (kind: "character" | "product", assetId?: string) =>
    workspace?.tasks.filter((t) => t.kind === kind && (!assetId || t.characterId === assetId)).at(-1);
  const referencePayload = (kind: "character" | "product", assetId?: string) => {
    const prior = failedReference(kind, assetId);
    return {
      kind,
      assetId: reference(kind, assetId)?.id,
      ...(prior?.canStartNew && prior.providerStarted
        ? { confirmNewRequest: true, failedTaskId: prior.id }
        : {}),
    };
  };
  const requestReference = (kind: "character" | "product", assetId?: string) => {
    const current = latest.find((a) => a.kind === kind && (!assetId || a.characterId === assetId));
    if (current) {
      setError("");
      setRegeneration({ kind, id: current.id, version: current.version, ...(assetId ? { assetId } : {}) });
    } else void act("reference", referencePayload(kind, assetId));
  };
  const continueRegeneration = async () => {
    if (!regeneration || busy || dirty || actionLock.current) return;
    const ok = await act("reference", {
      ...referencePayload(regeneration.kind, regeneration.assetId),
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
    character: !!reference("character"), product: !!reference("product"), characterIds: characterAssets.map(a => a.id),
  }) && currentApproved("location");
  const selectStoryboard = useCallback(() => setView("storyboard"), []);
  const locationFeedback = locationReferenceFeedback(workspace?.artifacts ?? [], {
    character: !!reference("character"), product: !!reference("product"), characterIds: characterAssets.map(a => a.id),
  });
  const sourcePanel = (kind: "character" | "product" | "location", assetId?: string) => {
    const proCharacterPanel = kind === "character" && !!assetId && studioMode === "pro";
    const panel = kind === "character" && assetId ? `character:${assetId}` as const : kind;
    const scopedLocked = assetId ? busy || dirty || proCharactersBlocked : locked;
    const label =
      kind === "character"
        ? "Character Sheet"
        : kind === "product"
          ? "Product Sheet"
          : "Location";
    const task = workspace?.tasks.filter((t) => t.kind === kind && (!assetId || t.characterId === assetId)).at(-1);
    const current = latest.find((a) => a.kind === kind && (!assetId || a.characterId === assetId) && !a.rejected);
    const history =
      workspace?.artifacts.filter(
        (a) =>
          a.kind === kind &&
          (!assetId || a.characterId === assetId) &&
          a.approved &&
          !a.rejected &&
          !latest.some((n) => n.id === a.id),
      ) ?? [];
    const image = (a: NonNullable<typeof current>) =>
      a.preview && !a.cleanupPending ? (
        <button
          type="button"
          aria-label={"Preview " + label + " version " + a.version}
          data-character-swipe-preview={proCharacterPanel ? "" : undefined}
          onDragStart={proCharacterPanel ? event => event.preventDefault() : undefined}
          className={"block w-full cursor-zoom-in rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring " + (proCharacterPanel ? "aspect-square overflow-hidden border border-border bg-muted/30" : "")}
          onClick={() => panels?.selectMedia("v3-reference:" + a.id)}
        >
          <Image
            unoptimized
            width={1024}
            height={1024}
            src={a.preview}
            alt={label}
            className={proCharacterPanel ? "aspect-square size-full rounded-lg object-contain" : "max-h-48 w-full rounded-lg object-contain"}
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
    ) : <Button variant={current || proCharacterPanel ? "default" : "outline"} className={proCharacterPanel ? "w-full" : undefined}
      disabled={!workspace || busy || dirty || proCharactersBlocked || referenceBusy(workspace.tasks, kind, undefined, assetId) || !reference(kind, assetId)}
      onClick={() => requestReference(kind, assetId)}>{proCharacterPanel && current && <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />}{current ? proCharacterPanel ? "Regenerate" : `Regenerate ${label}` : `Generate ${label}`}</Button>;
    return (
      <StudioPanelPortal key={panel} panel={panel}>
        <section
          className="space-y-2 text-xs [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:text-xs [&_button]:h-auto [&_button]:min-h-8 [@media(pointer:coarse)]:[&_button]:min-h-11"
          aria-label={label}
          aria-busy={
            (busy && actionArea === panel) ||
            (!!task && ["queued", "running"].includes(task.status))
          }
        >
          {kind === "location" && (
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Location
            </h3>
          )}
          {proCharacterPanel && (!current || !current.preview) && <div className="flex aspect-square w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/30 text-[11px] text-muted-foreground">{current ? current.cleanupPending ? "Deletion pending" : "Loading sheet…" : "No sheet generated yet"}</div>}
          {!current && generationButton}
          {kind === "location" && showLocationFeedback && locationFeedback && (
            <p role="status" aria-live="polite" className="text-muted-foreground">{locationFeedback}</p>
          )}
          {kind !== "location" && current && !proCharacterPanel && (
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
          {busy && actionArea === panel && (
            <p role="status" className="text-muted-foreground">
              Preparing your request…
            </p>
          )}
          {error && actionArea === panel && (
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
                        requestReference(current.kind, assetId);
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
              ) : current.approved ? proCharacterPanel ? <p role="status" className="flex items-center gap-1.5 text-success-foreground"><CircleCheck className="size-3.5" aria-hidden="true" />Approved</p> : null : (
                <>
                  <p role="status" className={proCharacterPanel ? "flex items-center gap-1.5 text-muted-foreground" : "text-muted-foreground"}>
                    {proCharacterPanel && <CircleCheck className="size-3.5 text-success-foreground" aria-hidden="true" />}
                    Ready for review
                  </p>
                  <div className={proCharacterPanel ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2"}>
                    <Button
                      disabled={scopedLocked || !current.current}
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
      <StudioWorkflowMedia media={previewMedia} autoSelectVideo />
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
      {characterPanels ? characterAssets.map(a => sourcePanel("character", a.id)) : sourcePanel("character")}
      {sourcePanel("product")}
      {sourcePanel("location")}
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
            {busy && actionArea === "workflow" && view !== "final" && (
              <p role="status" className="text-sm text-muted-foreground">
                Preparing your request…
              </p>
            )}
            {workflowError && actionArea === "workflow" && (view !== "progress" || !workspace) && (
              <p
                role="alert"
                className="break-words rounded-lg border border-destructive/30 p-3 text-sm"
              >
                {view !== "final" && workflowError !== "V3_DIRECT_APPROVAL_SETUP_REQUIRED" && /PACKAGE|STORYBOARD|APPROV/.test(workflowError)
                  ? packageBuildError(workflowError)
                  : v3ActionErrorMessage(workflowError)}
              </p>
            )}
            {!workspace ? (
              <p role="status" className="text-sm text-muted-foreground">
                Loading generation status…
              </p>
            ) : (
              <>
                {view === "progress" && <V3WorkflowProgress
                  workspace={workspace}
                  productRequired={!!reference("product")}
                  busy={busy}
                  locked={locked}
                  error={actionArea === "workflow" ? workflowError : statusError}
                  buildFailure={buildActionFailure}
                  act={act}
                />}
                {view === "storyboard" && (
                  <section className="space-y-3">
                    <h2 className="font-semibold">Storyboard</h2>
                    <Button
                      variant="default"
                      disabled={
                        locked ||
                        proCharactersBlocked || workspace.proDurationRetained || !!locationFeedback ||
                        !currentApproved("character") ||
                        !currentApproved("location") ||
                        (!!reference("product") && !currentApproved("product"))
                      }
                      onClick={() => {
                        setStoryboardRequestPending(true);
                        void act("storyboard").finally(() =>
                          setStoryboardRequestPending(false),
                        );
                      }}
                    >
                      Generate Storyboard
                    </Button>
                    {workspace.proDurationRetained && <p role="status" className="text-sm text-muted-foreground">Your Pro duration and story are preserved. Switch to Pro or choose a Basic duration to continue.</p>}
                    {storyboardLoading && <V3StoryboardSkeleton />}
                    {storyboards.map((a) => (
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
                            <p className="text-sm">{a.storyboard?.version === "director-storyboard-connected-v1" ? "Connected Storyboard approved. Build and approve its Generation Package, then generate clips in Final Video." : "Storyboard approved"}</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={locked || !a.current || workspace.proDurationRetained}
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
                  <section className="min-w-0 space-y-3">
                    <h2 className="font-semibold">Package &amp; Estimates</h2>
                    {workspace.selectedResolution && <p className="text-xs text-muted-foreground">Selected output: {workspace.selectedResolution}</p>}
                    {workspace.resolutionPricingAvailable === false && <p role="status" className="text-sm text-warning-foreground">Pricing for {workspace.selectedResolution} is not configured. Choose 480p or wait for a verified rate before approving paid generation.</p>}
                    <Button
                      variant="default"
                      className="w-full max-w-full whitespace-normal sm:w-auto"
                      disabled={locked || workspace.proDurationRetained || !currentApproved("storyboard")}
                      onClick={() => {
                        setPackageRequestPending(true);
                        void act("build_package", {
                          retryTaskId: packageTask?.id,
                        }).finally(() => setPackageRequestPending(false));
                      }}
                    >
                      <Layers2 aria-hidden="true" className="size-4 shrink-0" />
                      <span className="min-w-0">Build package and estimate</span>
                    </Button>
                    {packageLoading && <V3PackageSkeleton />}
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
                    {packageTask && !packageLoading && !packageReady && (
                      <PackageStatus
                        task={packageTask}
                        technical={false}
                      />
                    )}
                    {p && !workspace.proDurationRetained && (
                      <>
                        <dl aria-label="Package overview" className="flex min-w-0 flex-wrap gap-2">
                          <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary"><dt>Resolution</dt><dd>{p.resolution}</dd></div>
                          <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary">
                            <Clock3 aria-hidden="true" className="size-4 shrink-0" /><dt className="sr-only">Video duration</dt><dd>{p.durationMs / 1000}s</dd>
                          </div>
                          <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-info-surface px-2.5 py-1.5 text-xs font-medium text-info-foreground">
                            {p.aspectRatio === "9:16" ? <Smartphone aria-hidden="true" className="size-4 shrink-0" /> : <Ratio aria-hidden="true" className="size-4 shrink-0" />}<dt className="sr-only">Aspect ratio</dt><dd>{p.aspectRatio}</dd>
                          </div>
                          <div className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-warning-surface px-2.5 py-1.5 text-xs font-medium text-warning-foreground">
                            <Layers2 aria-hidden="true" className="size-4 shrink-0" /><dt className="sr-only">Generation segments</dt><dd className="min-w-0">{p.segmentCount} {p.segmentCount === 1 ? "generation segment" : "generation segments"}</dd>
                          </div>
                          <div className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${packageReady ? "bg-success-surface text-success-foreground" : "bg-warning-surface text-warning-foreground"}`}>
                            {packageReady ? <CircleCheck aria-hidden="true" className="size-4 shrink-0" /> : <Info aria-hidden="true" className="size-4 shrink-0" />}<dt className="sr-only">Review state</dt><dd className="min-w-0">{packageReviewLabel}</dd>
                          </div>
                        </dl>
                      <div className="min-w-0 space-y-3 rounded-xl border border-primary/20 bg-card p-4">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
                          <h3 className="text-sm font-medium text-foreground">Estimated video cost</h3>
                          <p className="break-words text-xl font-semibold tracking-tight text-primary">
                          {((workspace.multiClip ? p.estimatedCostMicrousd : p.displayEstimatedCostMicrousd) ??
                            p.estimatedCostMicrousd) === null
                            ? "Unavailable"
                            : `~${money(workspace.multiClip ? p.estimatedCostMicrousd : p.displayEstimatedCostMicrousd ?? p.estimatedCostMicrousd)}`}
                          </p>
                        </div>
                        {p.segmentCount > 1 && (
                          <ul className="space-y-1 text-sm">
                            {p.segments.map((s, i) => (
                              <li key={s.id}>
                                Segment {i + 1} · {s.durationMs / 1000}s: ~
                                {money(
                                  workspace.multiClip ? s.estimatedCostMicrousd : s.displayEstimatedCostMicrousd ??
                                    s.estimatedCostMicrousd,
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        <div className="space-y-2 border-t border-primary/15 pt-3">
                        <label className="block w-full space-y-1 text-sm font-medium sm:w-1/2">
                          <span className="block">Maximum authorized USD</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="h-11 w-full min-w-0 rounded-lg border border-primary/25 bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                            value={maximumValue}
                            onChange={(e) =>
                              setMaximum({
                                packageHash: p.packageHash,
                                value: e.target.value,
                              })
                            }
                          />
                        </label>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          The suggested maximum includes a configurable{" "}
                          {p.suggestedAuthorizationBufferPercent}% buffer and can be edited before approving.
                        </p>
                        </div>
                        <div className="space-y-3 border-t border-primary/15 pt-3">
                        <label className="flex min-h-11 cursor-pointer items-start gap-2 text-sm leading-relaxed">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
                          variant="default"
                          className="w-full whitespace-normal"
                          disabled={
                            !packageReady ||
                            workspace.resolutionPricingAvailable === false ||
                            p.issues.includes("V3_RESOLUTION_PRICING_NOT_CONFIGURED") ||
                            packageApproved ||
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
                        <p className="flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-muted-foreground">
                          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                          {packageApproved ? "Package approved. Continue to Final Video." : "Final video unlocks after package approval."}
                        </p>
                        </div>
                      </div>
                        {p.transportEnabled && p.issues.some(issue => !["V3_AUTHORIZATION_REQUIRED", "V3_SEGMENT_AUTHORIZATION_REQUIRED"].includes(issue)) && (
                          <p
                            role="status"
                            className="text-sm text-muted-foreground"
                          >
                            Video generation is awaiting setup or approval.
                          </p>
                        )}
                      </>
                    )}
                  </section>
                )}
                {view === "final" && (
                  <section className="min-w-0 space-y-4">
                    {Number(p?.durationMs ?? storyboards[0]?.storyboard?.durationMs ?? 0) > 30_000 ? <V3ClipManager workspace={workspace} act={act} disabled={busy || dirty} studioMode={studioMode} /> : <>
                    <h2 className="font-semibold">Final Video</h2>
                    <FinalVideoGenerate
                      generating={finalVideoGenerating}
                      disabled={locked || workspace.proDurationRetained || !p?.canSubmit || finalVideo.hasExistingRun}
                      onGenerate={() => {
                        if (!p) return;
                        setVideoRequestPending(true);
                        void act("generate", {
                          packageId: p.packageId,
                          packageHash: p.packageHash,
                        }).finally(() => setVideoRequestPending(false));
                      }}
                    />
                    {!finalVideo.loading && !finalVideo.hasExistingRun && finalVideo.reason && (
                      <p role="status" className="text-sm text-muted-foreground">{finalVideo.reason}</p>
                    )}
                    {finalVideo.runs
                    .filter(run => !finalVideo.loading || !finalVideo.activeRuns.some(active => active.id === run.id))
                    .map((r) => (
                      <FinalVideoReview
                        key={r.id}
                        run={r}
                        act={act}
                        busy={locked}
                        segmentCount={p?.segmentCount ?? 1}
                        generating={finalVideoGenerating}
                      />
                    ))}
                    </>}
                    {workspace.tasks.filter(task => !workspace.multiClip && task.kind === "join" && task.status === "failed").map(task => (
                      <div key={task.id} className="space-y-2">
                        <p role="alert" className="text-sm text-muted-foreground">The final video could not be joined. Recover the saved segments or see Progress.</p>
                        <Button variant="outline" disabled={locked} onClick={() => void act("recover_task", { id: task.id })}>Recover local join</Button>
                      </div>
                    ))}
                  </section>
                )}
                {workspace.complete && view !== "progress" && (
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
