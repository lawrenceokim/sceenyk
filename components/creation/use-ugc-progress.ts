"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isUgcJobActive, shouldPollUgcProgress, ugcProgressPollMilliseconds, type UgcJobProgress } from "@/lib/ugc-jobs/contract";

type ProgressSnapshot = {
  scope: string | null; job: UgcJobProgress | null; error: boolean; receivedAt: number;
};

// Project-scoped, independent of editable brief/revision and Properties mounting.
// Browser timers only schedule reads; they never advance workflow state.
export function useUgcProgress(projectId: string | null, authenticated: boolean) {
  const scope = authenticated ? projectId : null;
  const [state, setState] = useState<ProgressSnapshot>();
  const latest = useRef<ProgressSnapshot | undefined>(undefined);
  const currentScope = useRef(scope);
  useEffect(() => { currentScope.current = scope; }, [scope]);
  const refresh = useRef<(() => void) | null>(null);
  const job = state?.scope === scope ? state.job : null;
  const settled = !scope || state?.scope === scope;
  const accept = useCallback((next: UgcJobProgress) => {
    if (!scope || currentScope.current !== scope) return;
    latest.current = { scope, job: next, error: false, receivedAt: Date.now() };
    setState(latest.current);
    refresh.current?.();
  }, [scope]);
  const checkStatus = useCallback(() => refresh.current?.(), []);

  useEffect(() => {
    if (!scope) return;
    let alive = true;
    let inFlight = false;
    let requested = false;
    let version = 0;
    let discover = true;
    let waitingKey = "";
    let waitingChecks = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const read = async () => {
      // Manual checks and an enqueue receipt share this loop. Queue one check
      // behind the pending fetch instead of starting another request/effect.
      if (inFlight) { requested = true; return; }
      clearTimeout(timer);
      inFlight = true;
      const readingVersion = version;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 15_000);
      let next: UgcJobProgress | null = null;
      let failed = false;
      try {
        const previous = latest.current?.scope === scope ? latest.current.job : null;
        const params = new URLSearchParams({ projectId: scope });
        if (!discover && previous) params.set("jobId", previous.id);
        const response = await fetch(`/api/ugc/progress?${params}`, {
          cache: "no-store", credentials: "same-origin", redirect: "error", signal: controller.signal,
        });
        if (!response.ok) throw new Error("UGC_PROGRESS_UNAVAILABLE");
        const result: { ok: boolean; job: UgcJobProgress | null } = await response.json();
        if (!result.ok) throw new Error("UGC_PROGRESS_UNAVAILABLE");
        next = result.job;
        discover = false;
      } catch { failed = true; }
      finally { clearTimeout(timeout); inFlight = false; }
      if (!alive) return;
      if (readingVersion === version) {
        const previous = latest.current;
        const snapshot: ProgressSnapshot = failed ? {
          scope, job: previous?.scope === scope ? previous.job : null, error: true,
          receivedAt: previous?.scope === scope ? previous.receivedAt : Date.now(),
        } : { scope, job: next, error: false, receivedAt: Date.now() };
        latest.current = snapshot;
        setState(snapshot);
      }
      const saved = latest.current?.scope === scope ? latest.current.job : null;
      const observedNow = saved ? Date.parse(saved.serverNow) + Math.max(0, Date.now() - (latest.current?.receivedAt ?? Date.now())) : Date.now();
      const liveRegeneration = saved?.referenceReview?.groups.some(group => group.execution?.state === "running" &&
        !!group.execution.leaseExpiresAt && Date.parse(group.execution.leaseExpiresAt) > observedNow);
      const waiting = saved && !["completed", "cancelled"].includes(saved.status) && saved.referenceReview?.groups.find(group =>
        group.execution?.state === "waiting" || group.execution?.state === "stalled" ||
        group.execution?.state === "running" && !!group.execution.leaseExpiresAt && Date.parse(group.execution.leaseExpiresAt) <= observedNow);
      if (requested) {
        requested = false;
        void read();
      } else if (saved && shouldPollUgcProgress(saved) && (!waiting || liveRegeneration)) {
        // Wait after settlement, including failures. Never use setInterval or
        // change the route/shell loading state during background refresh.
        timer = setTimeout(() => void read(), ugcProgressPollMilliseconds);
      } else {
        const key = waiting ? `${saved?.id}:${waiting.type}:${waiting.version}` : "";
        if (key !== waitingKey) { waitingKey = key; waitingChecks = 0; }
        // Two minutes of slow discovery, then focus/manual checks only. A queued
        // request never masquerades as running work or polls every 2.5 seconds.
        if (waiting && waitingChecks < 8) { waitingChecks += 1; timer = setTimeout(() => void read(), 15_000); }
      }
    };
    refresh.current = () => { version += 1; void read(); };
    const onActive = () => {
      const saved = latest.current?.scope === scope ? latest.current.job : null;
      // Paused jobs have no timer. Focus/visibility are one-off observations,
      // coalesced with any pending read, never a resume or a second loop.
      if (document.visibilityState === "visible" && saved?.paused && (isUgcJobActive(saved.status) ||
        saved.referenceReview?.groups.some(group => group.execution?.state === "waiting" || group.execution?.state === "stalled")) && !inFlight) refresh.current?.();
    };
    window.addEventListener("focus", onActive);
    window.addEventListener("pageshow", onActive);
    document.addEventListener("visibilitychange", onActive);
    void read();
    return () => {
      alive = false; refresh.current = null; clearTimeout(timer); controller?.abort();
      window.removeEventListener("focus", onActive);
      window.removeEventListener("pageshow", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [scope]);

  return {
    // Future explicit resume handlers call this after their server-confirmed
    // resume. It only reads the SAME job, retaining all completed checkpoints.
    job, accept, checkStatus, refreshAfterResume: checkStatus, loading: !settled,
    error: state?.scope === scope && state.error,
    receivedAt: state?.scope === scope ? state.receivedAt : 0,
  };
}
