"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RuntimeDto } from "@/lib/final-video-generation-v3/runtime-server";
import { V3StatusReadError, finalOperationFinished, restoredFinalIntent, type FinalOperationAction, type FinalOperationIntent, type FinalOperationPresentation, type FinalOperationStatus } from "@/lib/final-video-generation-v3/final-operation";
import { v3ActionErrorMessage } from "@/lib/final-video-generation-v3/reference-errors";

async function responseBody(response: Response) {
  let body;
  try { body = await response.json(); } catch { throw new V3StatusReadError("V3_STATUS_UNAVAILABLE", response.status >= 500); }
  if (!response.ok || !body.ok) throw new V3StatusReadError(body.code ?? "V3_STATUS_UNAVAILABLE", body.retryable === true || (body.retryable !== false && [408, 429, 502, 503, 504].includes(response.status)));
  return body;
}
const storageKey = (id: string) => `sceenyk:v3:final-operation:${id}`;
function saveIntent(projectId: string, intent: FinalOperationIntent | null) {
  try { if (intent) localStorage.setItem(storageKey(projectId), JSON.stringify(intent)); else localStorage.removeItem(storageKey(projectId)); } catch { /* Saved database status still recovers when browser storage is unavailable. */ }
}

export function useV3FinalOperation(projectId: string | null, workspace: RuntimeDto | null,
  refresh: (signal?: AbortSignal) => Promise<RuntimeDto | null>, enabled = true) {
  const [intent, setIntent] = useState<FinalOperationIntent | null>(null);
  const [phase, setPhase] = useState<"requesting" | "checking" | "refreshing">("checking");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState<string | null>(null);
  const [paused, setPaused] = useState(false), [check, setCheck] = useState(0);
  const submitting = useRef(false), currentProject = useRef(projectId);
  const group = workspace?.multiClip, merge = group?.merge;
  const serverActive = !!merge && (["queued", "running"].includes(merge.status ?? "") || merge.deleting && !workspace?.runs.find(r => r.id === merge.resultId)?.errorCode);
  const remember = useCallback((value: FinalOperationIntent | null) => {
    if (!projectId || currentProject.current !== projectId) return;
    saveIntent(projectId, value); setIntent(value);
  }, [projectId]);
  useEffect(() => {
    currentProject.current = projectId;
    const restore = () => {
      let restored = null;
      try { if (projectId) restored = restoredFinalIntent(localStorage.getItem(storageKey(projectId)), projectId, Date.now()); } catch { /* Storage is optional. */ }
      setIntent(restored); setError(""); setPaused(false); setPhase("checking");
    };
    const timer = setTimeout(restore, 0);
    const onStorage = (event: StorageEvent) => { if (projectId && event.key === storageKey(projectId)) restore(); };
    window.addEventListener("storage", onStorage);
    return () => { clearTimeout(timer); window.removeEventListener("storage", onStorage); currentProject.current = null; };
  }, [projectId]);
  const matching = !intent || intent.projectId === projectId && (!group || intent.packageId === group.packageId && intent.packageHash === group.packageHash && intent.manifestHash === merge?.manifestHash);
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => setPaused(false), 0);
    return () => clearTimeout(timer);
  }, [enabled]);
  useEffect(() => {
    if (matching) return;
    const timer = setTimeout(() => remember(null), 0);
    return () => clearTimeout(timer);
  }, [matching, remember]);

  useEffect(() => {
    if (!enabled || !projectId || paused || !matching || (!intent && !serverActive)) return;
    const packageId = intent?.packageId ?? group?.packageId, manifest = intent?.manifestHash ?? merge?.manifestHash;
    if (!packageId || !manifest) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>, failures = 0, refreshFailures = 0;
    const tick = async () => {
      let delay = 3000;
      try {
        const query = new URLSearchParams({ scope: "final", project: projectId, package: packageId, manifest });
        const body = await responseBody(await fetch(`/api/ugc/v3?${query}`, { cache: "no-store", redirect: "error", signal: controller.signal }));
        if (controller.signal.aborted) return;
        const status: FinalOperationStatus = body.operation;
        failures = 0; setDetail(null);
        const active = ["queued", "running"].includes(status.status ?? "") || status.rejected && ["queued", "running"].includes(status.deletionStatus ?? "");
        if (intent?.action === "merge" && !intent.accepted && status.taskId && ["queued", "running"].includes(status.status ?? "")) {
          // A saved matching task is positive admission evidence even when the POST acknowledgement was lost.
          remember({ ...intent, accepted: true });
        }
        if (intent ? finalOperationFinished(intent, status) : !active) {
          setPhase("refreshing");
          let saved: RuntimeDto | null;
          try { saved = await refresh(controller.signal); }
          catch (failure) {
            if (failure instanceof V3StatusReadError && failure.retryable && ++refreshFailures >= 6) {
              setError("Your operation is saved, but the Studio status could not be refreshed. Check status to reconnect."); setPaused(true); return;
            }
            throw failure;
          }
          if (controller.signal.aborted) return;
          // Completion is rendered from the full current workspace, never the local marker.
          if (saved && (intent?.action === "approve" ? saved.runs.some(r => r.id === intent.id && r.state !== "awaiting_review") :
            intent?.action === "reject_delete" || intent?.action === "recover" ? saved.runs.some(r => r.id === intent.id && (r.state === "deleted" || r.state === "deleting" && !!r.errorCode)) :
            saved.multiClip?.merge?.taskId === status.taskId && !["queued", "running"].includes(saved.multiClip.merge.status ?? "") &&
              (!saved.multiClip.merge.deleting || saved.runs.some(r => r.id === status.resultId && !!r.errorCode)))) {
            remember(null); setError(""); return;
          }
          if (!saved && ++refreshFailures >= 6) {
            setError("Your operation is saved, but the Studio status could not be refreshed. Check status to reconnect."); setPaused(true); return;
          }
          delay = 10_000;
          setDetail("The saved operation is finished. Refreshing the final status...");
        } else {
          if (!submitting.current) setPhase("checking");
          // No positive acknowledgement is inferred from a successful status read.
          const confirmed = intent?.action === "merge" ? intent.accepted || !!status.taskId && ["queued", "running"].includes(status.status ?? "") : intent?.action === "approve" ? status.approved : status.rejected;
          if (intent && !confirmed && Date.now() - intent.startedAt > 180_000 && !submitting.current) {
            setError("The request could not be confirmed. Check the saved status before trying again. Your clips and saved video are preserved.");
            remember(null); setPaused(true); return;
          }
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof V3StatusReadError && !failure.retryable) {
          setError(v3ActionErrorMessage(failure.code)); setPaused(true); return;
        }
        failures++; delay = Math.min(30_000, 5000 * 2 ** Math.min(failures - 1, 3));
        setDetail("Connection interrupted. Checking the saved operation status...");
        if (failures >= 6) { setError("The processing service is still unreachable. Check status when the connection returns. Your saved videos are preserved."); setPaused(true); return; }
      }
      if (!controller.signal.aborted) timer = setTimeout(tick, delay);
    };
    timer = setTimeout(tick, 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, projectId, intent, matching, serverActive, group?.packageId, merge?.manifestHash, paused, check, refresh, remember]);

  const submit = async (action: FinalOperationAction, payload: Record<string, unknown>) => {
    if (!projectId || !group || !merge?.manifestHash || submitting.current || intent || serverActive) return false;
    submitting.current = true; setPhase("requesting"); setError(""); setDetail(null); setPaused(false);
    const pending: FinalOperationIntent = { projectId, packageId: group.packageId, packageHash: group.packageHash, manifestHash: merge.manifestHash,
      action, id: typeof payload.id === "string" ? payload.id : null, startedAt: Date.now(), accepted: false,
      baselineTaskId: merge.taskId, baselineStatus: merge.status };
    remember(pending);
    try {
      await responseBody(await fetch("/api/ugc/v3", { method: "POST", redirect: "error", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, action, projectId, response: "acknowledge" }) }));
      if (currentProject.current !== projectId) return true;
      remember({ ...pending, accepted: true }); setPhase("checking"); return true;
    } catch (failure) {
      if (currentProject.current !== projectId) return false;
      if (failure instanceof V3StatusReadError && !failure.retryable) {
        remember(null); setError(v3ActionErrorMessage(failure.code)); return false;
      }
      setPhase("checking"); setDetail("The response was interrupted. Checking whether your request was saved...");
      // Never replay a mutation on a transport failure, including approval.
      return false;
    } finally { submitting.current = false; }
  };
  const active = matching && (!!intent || serverActive) && !paused;
  const presentation: FinalOperationPresentation = {
    active, blocked: matching && (!!intent || serverActive), error, detail,
    message: !active ? null : phase === "refreshing" ? "Refreshing final status..." : intent?.action === "approve" ?
      phase === "requesting" ? "Approving final video..." : "Checking final approval..." :
      intent?.action === "reject_delete" || intent?.action === "recover" || merge?.deleting ? "Deleting merged video..." :
      intent && !intent.accepted ? phase === "requesting" ? "Starting video merge..." : "Checking merge request..." : "Merging videos...",
    checkStatus: () => { setError(""); setPaused(false); setCheck(value => value + 1); if (!intent && !serverActive) void refresh().catch(failure => setError(v3ActionErrorMessage(failure instanceof Error ? failure.message : "V3_STATUS_UNAVAILABLE"))); },
  };
  return { submit, presentation };
}
