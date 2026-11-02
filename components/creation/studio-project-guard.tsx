"use client";

import { Activity, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { projectAvailabilityAction } from "@/app/actions/projects";
import { isProjectDeleted, subscribeProjectDeletion } from "@/lib/projects/client-lifecycle";
import { Button } from "@/components/ui/button";
import { StudioSkeleton } from "./studio-skeleton";

type Status = { id: string | null; phase: "checking" | "ready" | "missing" | "error" };

// One boundary owns saved-project admission, retained-route checks and a full
// editor reset. Generation/media children keep their existing lifecycle logic.
export function StudioProjectGuard({ initialProjectId, children }: {
  initialProjectId?: string;
  children: (bindProject: (id: string) => void, fresh: boolean) => ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState({ projectId: initialProjectId ?? null, fresh: false, revision: 0 });
  // Upload's native replaceState changes the URL without remounting Studio.
  const projectId = /^\/projects\/([^/]+)\/?$/.exec(pathname)?.[1] ?? session.projectId;
  const activeProject = useRef(projectId);
  const [status, setStatus] = useState<Status>({ id: projectId, phase: projectId ? "checking" : "ready" });
  const [retry, setRetry] = useState(0);
  const deleted = useSyncExternalStore(subscribeProjectDeletion, () => isProjectDeleted(projectId), () => false);

  const bindProject = useCallback((id: string) => {
    // A confirmed save is already an authoritative existence check. Do not
    // interrupt the first upload or discard its local File during URL binding.
    setSession(current => ({ ...current, projectId: id }));
    setStatus({ id, phase: "ready" });
  }, []);

  const resetToNewProject = useCallback(() => {
    setSession(current => current.fresh && !current.projectId ? current : {
      projectId: null, fresh: true, revision: current.revision + 1,
    });
    if (window.location.pathname !== "/studio") router.replace("/studio");
  }, [router]);

  useLayoutEffect(() => { activeProject.current = projectId; }, [projectId]);
  useLayoutEffect(() => () => {
    // Activity runs this before hiding the route. Gate the next reveal until
    // the DB responds, while retaining unrelated/live drafts in nested Activity.
    if (activeProject.current) setStatus({ id: activeProject.current, phase: "checking" });
  }, []);

  useEffect(() => {
    if (!deleted) return;
    // The deletion snapshot already hides/unmounts old children this render.
    const timer = setTimeout(resetToNewProject, 0);
    return () => clearTimeout(timer);
  }, [deleted, projectId, resetToNewProject]);

  useEffect(() => {
    if (!projectId || deleted) return;
    let active = true;
    let request = 0;
    const verify = async (hide: boolean) => {
      const version = ++request;
      if (hide) setStatus({ id: projectId, phase: "checking" });
      const failed = () => setStatus(current => !hide && current.id === projectId && current.phase === "ready"
        ? current : { id: projectId, phase: "error" });
      try {
        const result = await projectAvailabilityAction(projectId);
        if (!active || version !== request || isProjectDeleted(projectId)) return;
        if (!result.ok) failed();
        else if (result.available) setStatus({ id: projectId, phase: "ready" });
        else {
          setStatus({ id: projectId, phase: "missing" });
          resetToNewProject();
        }
      } catch {
        if (active && version === request) failed();
      }
    };
    // A native file picker returns focus/visibility to this SAME editor. Check
    // existence in the background without hiding Activity and aborting uploads.
    const onActive = () => { if (document.visibilityState !== "hidden") void verify(false); };
    const onPageShow = () => { if (document.visibilityState !== "hidden") void verify(true); };
    void verify(false);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onActive);
    document.addEventListener("visibilitychange", onActive);
    return () => {
      active = false;
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onActive);
      document.removeEventListener("visibilitychange", onActive);
    };
  }, [projectId, deleted, retry, resetToNewProject]);

  const blocked = deleted || !!projectId && (status.id !== projectId || status.phase !== "ready");
  return <>
    {blocked && (status.phase === "error" && !deleted ?
      <div role="alert" className="p-6 text-sm">
        <p>Your project couldn’t be checked. Try again to open it.</p>
        <Button className="mt-4" onClick={() => setRetry(value => value + 1)}>Try again</Button>
      </div> : <StudioSkeleton />)}
    <Activity key={session.revision} mode={blocked ? "hidden" : "visible"}>
      {deleted || status.id === projectId && status.phase === "missing" ? null : children(bindProject, session.fresh)}
    </Activity>
  </>;
}
