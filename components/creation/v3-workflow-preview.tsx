"use client";
import { V3LocationStatus } from "./v3-location-status";
import { StudioActionNotice } from "./studio-action-notice";
import { V3StoryboardContent } from "./v3-storyboard-content";
import { V3StoryboardSkeleton } from "./v3-storyboard-skeleton";
import { V3PackageSkeleton } from "./v3-package-skeleton";
import { V3WorkflowProgress } from "./v3-workflow-progress";
import { V3ClipManager } from "./v3-clip-manager";
import { useV3FinalOperation } from "./use-v3-final-operation";
import { V3StatusReadError, type FinalOperationAction } from "@/lib/final-video-generation-v3/final-operation";
import { creativeMutationActions, type CreativeLockSummary } from "@/lib/final-video-generation-v3/creative-lock-contract";
import { FinalVideoGenerate, FinalVideoReview } from "./v3-final-video-controls";
import { finalVideoPresentation } from "./v3-final-video-state";
import { shouldPollV3Video } from "@/lib/final-video-generation-v3/video-progress";
import { StudioWorkflowGuidance } from "./studio-workflow-guidance";
import { generationUnavailability } from "@/lib/accounting/generation-unavailability";
import { creditRefreshKey, notifyCreditsChanged } from "@/lib/accounting/client-events";

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
import { AppNotification } from "@/components/notifications/app-notification";
import { confirmedAction } from "@/lib/cache/account-cache";


const money = (amount: number | null) => {
  if (amount === null) return "Unavailable";
  const cents = (BigInt(amount) + BigInt(5000)) / BigInt(10000);
  return `$${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, "0")}`;
};
type Action = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<boolean>;
function PackageStatus({
  task,
}: {
  task: RuntimeDto["tasks"][number];
}) {
  const d = task.packageBuild;
  if (!d) return null;
  return (
    <div className="space-y-2 text-sm">
      <p role="status">{packageBuildLabel(d, task.status)}</p>
      {d.code && (
        <AppNotification role="alert" className="text-destructive">
          {packageBuildError(d.code)}
        </AppNotification>
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
  onCreativeLock,
}: {
  initial?: RuntimeDto;
  projectId: string;
  assets: ProjectAsset[];
  dirty: boolean;
  revision: string;
  onCreativeLock?: (lock: CreativeLockSummary | null) => void;
}) {
  const [workspace, setWorkspace] = useState(initial ?? null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [statusError, setStatusError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [retryFinalRead, setRetryFinalRead] = useState(false);
  const [statusRetryable, setStatusRetryable] = useState(false);
  const [statusPaused, setStatusPaused] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const statusFailures = useRef(0);
  const lockKey = JSON.stringify(workspace?.creativeLock ?? null);
  const notifiedLock = useRef<string | null>(null);
  useEffect(() => {
    const key = `${projectId}:${lockKey}`;
    if (!onCreativeLock || notifiedLock.current === key) return;
    notifiedLock.current = key; onCreativeLock(JSON.parse(lockKey));
  }, [onCreativeLock, projectId, lockKey]);
  const [buildActionFailure, setBuildActionFailure] = useState<{
    code: string;
    httpStatus: number | null;
  } | null>(null);
  const refreshLock = useRef(false);
  const initialRead = useRef<string | null>(null);
  const actionLock = useRef(false);
  const workspaceVersion = useRef(0);
  const [regeneration, setRegeneration] = useState<{
    assetId?: string;
    kind: "character" | "product";
    id: string;
    version: number;
  } | null>(null);
  const panels = useStudioPanels();
  const workflowVisible = panels?.workflowOpen ?? true;
  // Source cards live outside the drawer. Keep their existing active-job
  // updates, while closed Final Video work has no polling timer.
  const referenceProcessing = !!workspace?.referenceCleanup?.processing || !!workspace?.tasks.some(task =>
    ["character", "product", "location"].includes(task.kind) && ["queued", "running"].includes(task.status));
  const statusEnabled = pageVisible && (workflowVisible || referenceProcessing);
  useEffect(() => {
    const sync = () => setPageVisible(document.visibilityState !== "hidden");
    const timer = setTimeout(sync, 0);
    document.addEventListener("visibilitychange", sync);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", sync); };
  }, []);
  const { mode: studioMode } = useStudioMode();
  const characterAssets = assets.filter(a => a.studioRole === "character" && a.status === "uploaded" && !a.removedFromDraft);
  const characterPanels = studioMode === "pro" || characterAssets.length > 1;
  const proCharactersBlocked = studioMode !== "pro" && characterAssets.length > 1;
  const [actionArea, setActionArea] = useState<string>("workflow");
  const [view, setView] = useState<
    "progress" | "storyboard" | "package" | "final"
  >("progress");
  const [actionNotice, setActionNotice] = useState<StudioActionNotice | null>(null);
  const noticeSequence = useRef(0);
  const dismissActionNotice = useCallback(() => setActionNotice(null), []);
  const showActionNotice = (message: string, button: HTMLElement, credits?: StudioActionNotice["credits"]) => setActionNotice({
    id: ++noticeSequence.current, message, target: button.closest<HTMLElement>("dialog, [role='dialog']") ?? document.body, credits,
  });
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
    async (signal?: AbortSignal, rethrowFailure = false) => {
      if (!projectId) return null;
      if (refreshLock.current) {
        return null;
      }
      refreshLock.current = true;
      setRefreshing(true);
      let saved: RuntimeDto | null = null;
      try {
        const version = workspaceVersion.current;
        const response = await fetch(
          `/api/ugc/v3?project=${encodeURIComponent(projectId)}`,
          { cache: "no-store", redirect: "error", signal },
        );
        const body = await response.json();
        if (!response.ok || !body.ok) throw new V3StatusReadError(body.code ?? "V3_STATUS_UNAVAILABLE", body.retryable === true);
        // An older status read must not overwrite a just-saved approval/action.
        if (!signal?.aborted && !actionLock.current && version === workspaceVersion.current) {
          setWorkspace(body.workspace);
          setStatusError("");
          saved = body.workspace;
          statusFailures.current = 0;
          setRetryFinalRead(false);
          setStatusRetryable(false);
          setStatusPaused(false);
        }
      } catch (e) {
        if (!signal?.aborted) {
          setStatusError(e instanceof Error ? e.message : "V3_STATUS_UNAVAILABLE");
          const temporary = e instanceof TypeError || !!e && typeof e === "object" && "retryable" in e && e.retryable === true;
          setStatusRetryable(temporary);
          const retry = temporary && ++statusFailures.current < 6;
          setRetryFinalRead(retry);
          setStatusPaused(!retry);
          if (rethrowFailure) throw e instanceof V3StatusReadError ? e : new V3StatusReadError(e instanceof Error ? e.message : "V3_STATUS_UNAVAILABLE", temporary);
        }
      } finally {
        refreshLock.current = false;
        setRefreshing(false);
      }
      return saved;
    },
    [projectId],
  );
  const refreshFinal = useCallback((signal?: AbortSignal) => refresh(signal, true), [refresh]);
  const finalOperation = useV3FinalOperation(projectId ?? null, workspace, refreshFinal, workflowVisible && pageVisible);
  useEffect(() => {
    // One project/revision bootstrap is also needed for the separate Source
    // cards. Closing the drawer must not start another read.
    // Mode is saved separately from the brief. Reconcile retained Pro settings
    // after a committed switch without remounting Studio or replaying actions.
    const fingerprint = `${projectId}:${revision}:${studioMode}`;
    if (!pageVisible || !workflowVisible && initialRead.current === fingerprint) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      initialRead.current = fingerprint;
      void refresh(controller.signal);
    }, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [refresh, revision, projectId, pageVisible, workflowVisible, studioMode]);
  useEffect(() => {
    if (!statusEnabled) return;
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
  }, [refresh, statusEnabled]);
  const processing =
    (!!workspace?.processing || !!workspace?.referenceCleanup?.processing || shouldPollV3Video(workspace?.runs ?? []) || !!workspace?.multiClip && retryFinalRead) && !finalOperation.presentation.blocked;
  const pollingInterval = !!workspace?.multiClip && retryFinalRead || workspace?.runs.some(run => run.state === "reconciliation_required" || run.submissionBlocker) ? 10_000 : 3000;
  useEffect(() => {
    if (!statusEnabled || statusPaused || !projectId || !processing) return;
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
  }, [projectId, processing, pollingInterval, refresh, statusEnabled, statusPaused]);
  const act: Action = async (action, payload = {}) => {
    if (actionLock.current) return false;
    if (workspace?.creativeLock && creativeMutationActions.has(action)) return false;
    const finalAction = !!workspace?.multiClip && (action === "merge" ||
      ["approve", "reject_delete", "recover"].includes(action) && workspace.runs.some(r => r.segmentId === "joined" && r.id === payload.id));
    if (finalAction) {
      workspaceVersion.current++; setError(""); setActionArea("workflow");
      return finalOperation.submit(action as FinalOperationAction, payload);
    }
    if (finalOperation.presentation.blocked) return false;
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
      let responseStatus = 0;
      const body = await confirmedAction(["projects", "templates", "marketplace", "purchases", "wallet", "allowance"], async () => {
      const response = await fetch("/api/ugc/v3", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, projectId: id, ...payload }),
      });
      responseStatus = response.status;
      return response.json();
      }, undefined, 0);
      if (!body.ok) {
        if (action === "build_package")
          setBuildActionFailure({
            code: body.code,
            httpStatus: responseStatus,
          });
        throw new Error(body.code);
      }
      workspaceVersion.current++;
      setWorkspace(body.workspace);
      setStatusError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "V3_ACTION_UNAVAILABLE");
      return false;
    } finally {
      actionLock.current = false;
      setBusy(false);
    }
  };
  const policy = workspace?.generationPolicy;
  const generationBlocked = !policy?.ready || !policy.settingsSupported || !policy.projectAllowed;
  const videoBlocked = generationBlocked || !policy?.videoAllowed;
  const showCreditShortage = (kind: "character" | "product" | "location" | "storyboard" | "video", button: HTMLElement) => {
    if (!policy?.ready) return false;
    const required = kind === "video" ? policy.requiredCredits : policy.preparationCredits * (kind === "location" ? 2 : 1);
    if (policy.availableCredits >= required) return false;
    const missing = required - policy.availableCredits;
    showActionNotice(`Add ${missing} more credit${missing === 1 ? "" : "s"} to continue.`, button, { required, available: policy.availableCredits });
    return true;
  };
  useEffect(() => { if (policy?.ready) notifyCreditsChanged(); }, [policy?.ready, policy?.remaining, policy?.reserved, policy?.consumed, policy?.availableCredits, policy?.reservedCredits]);
  useEffect(() => {
    if (!statusEnabled) return;
    const reload = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const storage = (event: StorageEvent) => { if (event.key === creditRefreshKey) reload(); };
    window.addEventListener("sceenyk:credits", reload);
    window.addEventListener("storage", storage);
    // Worker/account changes in another project need no browser event. Read
    // only while the paid panel is visible; this never starts generation.
    // Active work already has a 3s/10s status loop. Idle paid panels need only
    // slow cross-project discovery; confirmed credit events still refresh now.
    const timer = !processing && !statusPaused && (policy?.funding === "credits" || policy?.preparationFunding === "credits") ? setInterval(reload, 60_000) : null;
    return () => {
      window.removeEventListener("sceenyk:credits", reload);
      window.removeEventListener("storage", storage);
      if (timer) clearInterval(timer);
    };
  }, [policy?.funding, policy?.preparationFunding, refresh, statusEnabled, processing, statusPaused]);
  const p = workspace?.preflight;
  const transientFinalRead = !!workspace?.multiClip && (retryFinalRead || finalOperation.presentation.active) && statusRetryable;
  const workflowError = error || (transientFinalRead ? "" : statusError);
  const maximumValue =
    workspace?.creativeLock && p?.authorizedMaximumMicrousd != null
      ? (p.authorizedMaximumMicrousd / 1_000_000).toFixed(2)
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
  // A saved execution proves approval of this exact package, even after its
  // one-use authority is consumed or expires. It grants no future submission.
  const savedPackageApproval = !!p && p.currentness === "current" && !workspace?.packageStale &&
    !!workspace?.runs.some(run => run.packageId === p.packageId && run.current && run.state !== "deleted");
  const packageApproved = savedPackageApproval || packageReady && p?.authorizationState === "bound" &&
    !p.issues.some(issue => issue.startsWith("V3_AUTHORIZATION_") || issue === "V3_SEGMENT_AUTHORIZATION_REQUIRED");
  const packageReviewLabel = packageApproved ? "Approved" : packageReady
    ? "Ready for review"
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
  const locked = busy || dirty || !!workspace?.processing || finalOperation.presentation.blocked;
  const creativeLocked = !!workspace?.creativeLock;
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
  const workflowReasons = (kind: "storyboard" | "package" | "video") => {
    const reasons = generationUnavailability(policy, kind);
    if (kind === "video" && finalVideo.reason) reasons.push(finalVideo.reason);
    if (kind === "video" && finalVideo.hasExistingRun) reasons.push("A video request already exists. Review or recover that request before starting another.");
    if (kind !== "video" && creativeLocked) reasons.push(v3ActionErrorMessage("V3_CREATIVE_INPUTS_LOCKED"));
    if (dirty) reasons.push("Save changes before starting generation.");
    if (busy) reasons.push("A Studio action is being saved. Wait for it to finish.");
    if (workspace?.processing) reasons.push("A generation is already processing. Check its saved status.");
    if (finalOperation.presentation.blocked) reasons.push("Resolve or recover the active final-video operation first.");
    if (proCharactersBlocked) reasons.push("Basic supports one character. Switch to Pro to use the retained multiple-character inputs.");
    if (workspace?.proDurationRetained) reasons.push("This project retains a Pro duration. Switch to Pro or use compatible settings.");
    if (kind === "storyboard") {
      if (locationFeedback) reasons.push(locationFeedback);
      if (!currentApproved("character")) reasons.push("Approve the current Character Sheet before generating the Storyboard.");
      if (!currentApproved("location")) reasons.push("Approve the current Location before generating the Storyboard.");
      if (reference("product") && !currentApproved("product")) reasons.push("Approve the current Product Sheet before generating the Storyboard.");
    }
    if (kind === "package" && !currentApproved("storyboard")) reasons.push("Approve the current Storyboard before building its Generation Package.");
    if (kind === "video" && !p?.canSubmit && !finalVideo.hasExistingRun) reasons.push(...(p?.issues.length ? p.issues.map(v3ActionErrorMessage) : ["Build and approve the current Generation Package before generating video."]));
    return [...new Set(reasons)];
  };
  const sourcePanel = (kind: "character" | "product" | "location", assetId?: string) => {
    const proCharacterPanel = kind === "character" && !!assetId && studioMode === "pro";
    const panel = kind === "character" && assetId ? `character:${assetId}` as const : kind;
    const scopedLocked = creativeLocked || (assetId ? busy || dirty || proCharactersBlocked : locked);
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
    const blockedReasons = generationUnavailability(policy, kind);
    if (creativeLocked) blockedReasons.push(v3ActionErrorMessage("V3_CREATIVE_INPUTS_LOCKED"));
    if (dirty) blockedReasons.push("Save changes before starting generation.");
    if (busy) blockedReasons.push("A Studio action is being saved. Wait for it to finish.");
    if (proCharactersBlocked) blockedReasons.push("Basic supports one character. Switch to Pro to use the retained multiple-character inputs.");
    if (kind === "location" && locationFeedback) blockedReasons.push(locationFeedback);
    if (kind === "location" && workspace?.processing) blockedReasons.push("Another generation is processing. Wait for it to finish.");
    if (finalOperation.presentation.blocked) blockedReasons.push("Resolve or recover the active final-video operation first.");
    if (workspace && referenceBusy(workspace.tasks, kind, undefined, assetId)) blockedReasons.push(
      task?.recoveryAvailable || task?.status === "reconciliation_required" || task?.status === "failed"
        ? `Recover or resolve the existing ${label} request before starting another.`
        : `${label} is already queued or generating. Check its saved status.`);
    if (kind !== "location" && !reference(kind, assetId)) blockedReasons.push(`Upload and save the ${kind === "character" ? "Character" : "Product / Prop"} source first.`);
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
        disabled={busy || creativeLocked || !!task && ["queued", "running"].includes(task.status)}
        onClick={event => {
          const reason = locationFeedback ?? blockedReasons[0];
          if (reason) {
            if (!locationFeedback && showCreditShortage(kind, event.currentTarget)) return;
            showActionNotice(reason, event.currentTarget); return;
          }
          const current = latest.find(a => a.kind === "location");
          void act("reference", { kind: "location", expectedId: current?.id, expectedVersion: current?.version });
        }}>{current ? "Regenerate Location" : "Generate Location"}</Button>
    ) : <Button variant={current || proCharacterPanel ? "default" : "outline"} className={proCharacterPanel ? "w-full" : undefined}
      disabled={busy || creativeLocked || !!task && ["queued", "running"].includes(task.status)}
      onClick={event => {
        const reason = !reference(kind, assetId) ? `Upload and save the ${kind === "character" ? "Character" : "Product / Prop"} source first.` : blockedReasons[0];
        if (reason) {
          if (reference(kind, assetId) && showCreditShortage(kind, event.currentTarget)) return;
          showActionNotice(reason, event.currentTarget); return;
        }
        requestReference(kind, assetId);
      }}>{proCharacterPanel && current && <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />}{current ? proCharacterPanel ? "Regenerate" : `Regenerate ${label}` : `Generate ${label}`}</Button>;
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
          {kind !== "location" && current && !proCharacterPanel && (
            <h4 className="font-medium">{label}</h4>
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
            <AppNotification role="alert" className="break-words text-destructive">
              {v3ActionErrorMessage(error)}
            </AppNotification>
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
              <AppNotification role="status" className="text-warning-foreground">
                Inputs changed. Generate again to replace the unstarted request.
              </AppNotification>
            )}
          {task &&
            ["failed", "reconciliation_required"].includes(task.status) &&
            !task.diagnostics &&
            !task.location && (
              <AppNotification role="status" className="text-destructive">
                {v3ActionErrorMessage(task.errorCode ?? "V3_TASK_FAILED")}
              </AppNotification>
            )}
          {kind !== "location" && task?.diagnostics && (
            <div className="space-y-2">
              <AppNotification role="status" className="text-muted-foreground">
                {referenceFailureLabel(kind, task.diagnostics)}
              </AppNotification>
              {task.canStartNew && (
                <p className="text-muted-foreground">
                  Generate starts a new request. The previous provider outcome
                  may be unconfirmed.
                </p>
              )}
              {task.recoveryAvailable && (
                <Button
                  variant="outline"
                  disabled={creativeLocked || busy || !task.current}
                  onClick={() => void act("recover_task", { id: task.id })}
                >
                  Recover saved response
                </Button>
              )}
            </div>
          )}
          {kind === "location" && (
            <V3LocationStatus task={task} busy={busy} dirty={dirty} act={act} policy={policy} onPrerequisite={showActionNotice} />
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
                    disabled={creativeLocked || busy}
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
                  <AppNotification role="status" className="text-warning-foreground">
                    {current.kind === "character" || current.kind === "product"
                      ? "Visual Style or source changed — regenerate and approve this sheet."
                      : "Stale — regenerate and approve."}
                  </AppNotification>
                  {(current.kind === "character" || current.kind === "product") && (
                    <Button variant="outline" disabled={creativeLocked || busy} onClick={() => void act("review_artifact", {
                      id: current.id, kind: current.kind, expectedVersion: current.version, decision: "reject",
                    })}>Reject and Delete</Button>
                  )}
                  {current.kind === "location" && !current.approved && (
                    <Button
                      variant="outline"
                      disabled={creativeLocked || busy}
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
                      disabled={creativeLocked || busy}
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
                    <AppNotification key={t.id} role="alert">
                      {v3ActionErrorMessage(
                        t.errorCode ?? "V3_REFERENCE_DISCARD_STORAGE_FAILED",
                      )}
                    </AppNotification>
                  ))}
                <Button
                  variant="outline"
                  disabled={creativeLocked || busy || !workspace.referenceCleanup.enabled}
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
        blocked={dirty || creativeLocked}
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
      {actionNotice && <StudioActionNotice key={actionNotice.id} notice={actionNotice} onDismiss={dismissActionNotice} />}
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
              <AppNotification role="status" className="text-sm text-warning-foreground">
                Save changes before generating or approving.
              </AppNotification>
            )}
            {busy && actionArea === "workflow" && view !== "final" && (
              <p role="status" className="text-sm text-muted-foreground">
                Preparing your request…
              </p>
            )}
            {workflowError && actionArea === "workflow" && (view !== "progress" || !workspace) && (
              <AppNotification
                role="alert"
                className="break-words rounded-lg border border-destructive/30 p-3 text-sm"
              >
                {view !== "final" && workflowError !== "V3_DIRECT_APPROVAL_SETUP_REQUIRED" && /PACKAGE|STORYBOARD|APPROV/.test(workflowError)
                  ? packageBuildError(workflowError)
                  : v3ActionErrorMessage(workflowError)}
              </AppNotification>
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
                      disabled={busy || creativeLocked || storyboardLoading || storyboardRequestPending}
                      onClick={event => {
                        if (showCreditShortage("storyboard", event.currentTarget)) return;
                        const reason = workflowReasons("storyboard")[0];
                        if (reason) { showActionNotice(reason, event.currentTarget); return; }
                        setStoryboardRequestPending(true);
                        void act("storyboard").finally(() =>
                          setStoryboardRequestPending(false),
                        );
                      }}
                    >
                      Generate Storyboard
                    </Button>
                    {workspace.proDurationRetained && <AppNotification role="status" className="text-sm text-muted-foreground">Your Pro duration and story are preserved. Switch to Pro or choose a Basic duration to continue.</AppNotification>}
                    {storyboardLoading && <V3StoryboardSkeleton />}
                    {storyboards.map((a) => (
                        <article
                          key={a.id}
                          className="space-y-3 rounded-xl border border-border p-4"
                        >
                          <V3StoryboardContent storyboard={a.storyboard!} />
                          {!a.current ? (
                            <AppNotification
                              role="status"
                              className="text-sm text-warning-foreground"
                            >
                              Storyboard is stale. Regenerate after approving
                              current references.
                            </AppNotification>
                          ) : a.approved ? (
                            <p className="text-sm">{a.storyboard?.version === "director-storyboard-connected-v1" ? "Connected Storyboard approved. Build and approve its Generation Package, then generate clips in Final Video." : "Storyboard approved"}</p>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                disabled={creativeLocked || locked || !a.current || workspace.proDurationRetained}
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
                                disabled={creativeLocked || busy}
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
                    {workspace.resolutionPricingAvailable === false && <AppNotification role="status" className="text-sm text-warning-foreground">Pricing for {workspace.selectedResolution} is not configured. Choose 480p or wait for a verified rate before approving paid generation.</AppNotification>}
                    <Button
                      variant="default"
                      className="w-full max-w-full whitespace-normal sm:w-auto"
                      disabled={busy || creativeLocked || packageLoading || packageRequestPending}
                      onClick={event => {
                        const reason = workflowReasons("package")[0];
                        if (reason) { showActionNotice(reason, event.currentTarget); return; }
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
                      <AppNotification
                        role="status"
                        className="text-sm text-warning-foreground"
                      >
                        This package needs rebuilding. Regenerate and approve
                        references and Storyboard for your saved style and
                        direction first.
                      </AppNotification>
                    )}
                    {packageTask && !packageLoading && !packageReady && (
                      <PackageStatus
                        task={packageTask}
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
                          <div className={`inline-flex max-w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ${packageReady || packageApproved ? "bg-success-surface text-success-foreground" : "bg-warning-surface text-warning-foreground"}`}>
                            {packageReady || packageApproved ? <CircleCheck aria-hidden="true" className="size-4 shrink-0" /> : <Info aria-hidden="true" className="size-4 shrink-0" />}<dt className="sr-only">Review state</dt><dd className="min-w-0">{packageReviewLabel}</dd>
                          </div>
                        </dl>
                      <div className="min-w-0 space-y-3 rounded-xl border border-primary/20 bg-card p-4">
                        <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-2">
                          <h3 className="text-sm font-medium text-foreground">Video credits</h3>
                          <p className="break-words text-xl font-semibold tracking-tight text-primary">
                            {!policy?.ready ? "Checking…" : !policy.settingsSupported ? "Unavailable for these settings" : policy.funding === "free" ? "Included" : `${policy.requiredCredits} credits`}
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
                        <div className="block w-full space-y-1 text-sm font-medium sm:w-1/2">
                          <span className="block">Maximum authorized USD</span>
                          <span className="block py-2 font-normal">${maximumValue}</span>
                        </div>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          The spending limit is calculated automatically from the approved generation pricing.
                        </p>
                        </div>
                        <div className="space-y-3 border-t border-primary/15 pt-3">
                        <p className="text-sm leading-relaxed">
                          Approving confirms this package and its displayed spending limit. Credits are reserved when you generate.
                        </p>
                        <Button
                          variant="default"
                          className="w-full whitespace-normal"
                          disabled={
                            !packageReady ||
                            workspace.resolutionPricingAvailable === false ||
                            p.issues.includes("V3_RESOLUTION_PRICING_NOT_CONFIGURED") ||
                            packageApproved ||
                            creativeLocked || locked || proCharactersBlocked ||
                            p.estimatedCostMicrousd === null ||
                            !p.quoteId ||
                            !maximumValue
                          }
                          onClick={() => {
                            void act("authorize", {
                              operatorApproved: true,
                              packageId: p.packageId,
                              packageHash: p.packageHash,
                              quoteId: p.quoteId,
                            });
                          }}
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
                          <AppNotification
                            role="status"
                            className="text-sm text-muted-foreground"
                          >
                            Video generation is awaiting setup or approval.
                          </AppNotification>
                        )}
                      </>
                    )}
                  </section>
                )}
                {view === "final" && (
                  <section className="min-w-0 space-y-4">
                    {Number(p?.durationMs ?? storyboards[0]?.storyboard?.durationMs ?? 0) > 30_000 ? <V3ClipManager workspace={workspace} generationBlocked={videoBlocked} act={act} disabled={busy || dirty || finalOperation.presentation.blocked} studioMode={studioMode} finalOperation={finalOperation.presentation} refreshingFinal={refreshing || retryFinalRead} /> : <>
                    <h2 className="font-semibold">Final Video</h2>
                    <FinalVideoGenerate
                      generating={finalVideoGenerating}
                      disabled={busy || finalVideo.hasExistingRun || videoRequestPending}
                      onGenerate={button => {
                        if (showCreditShortage("video", button)) return;
                        const reason = workflowReasons("video")[0];
                        if (reason) { showActionNotice(reason, button); return; }
                        if (!p) return;
                        setVideoRequestPending(true);
                        void act("generate", {
                          packageId: p.packageId,
                          packageHash: p.packageHash,
                        }).finally(() => setVideoRequestPending(false));
                      }}
                    />
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
                        <AppNotification role="alert" className="text-sm text-muted-foreground">The final video could not be joined. Recover the saved segments or see Progress.</AppNotification>
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
