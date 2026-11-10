"use client";
import type { ProjectCardStatus } from "@/lib/projects/card-status";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { generationStatusesAction } from "@/app/actions/generation";
import {
  generationStatusLabels,
} from "@/lib/generation/contract";

export type ProjectJobStatuses = Record<string, ProjectCardStatus>;
const Statuses = createContext<ProjectJobStatuses>({});

// One bounded owned request for the visible page, including retained-route recovery.
export function ProjectJobStatusesProvider({
  initial,
  children,
}: {
  initial: ProjectJobStatuses;
  children: ReactNode;
}) {
  const [statuses, setStatuses] = useState(initial);
  const idsKey = Object.keys(initial).sort().join(",");
  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    if (!ids.length) return;
    let active = true;
    const unavailable = Object.fromEntries(
      ids.map((id) => [id, "unavailable" as const]),
    );
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      generationStatusesAction(ids)
        .then((result) => {
          if (!active) return;
          setStatuses(
            result.ok
              ? Object.fromEntries(
                  ids.map((id) => [
                    id,
                    id in result.value ? result.value[id] : "unavailable",
                  ]),
                )
              : unavailable,
          );
        })
        .catch(() => {
          if (active) setStatuses(unavailable);
        });
    };
    reload();
    window.addEventListener("pageshow", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.removeEventListener("pageshow", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [idsKey]);
  return <Statuses.Provider value={statuses}>{children}</Statuses.Provider>;
}
export function ProjectJobBadge({
  projectId,
  initialStatus,
}: {
  projectId: string;
  initialStatus?: ProjectCardStatus;
}) {
  const statuses = useContext(Statuses);
  const status = projectId in statuses ? statuses[projectId] : initialStatus;
  if (status === "final_approved") return null;
  return (
    <span
      aria-live="polite"
      className="rounded-full bg-muted px-2.5 py-1 text-caption font-medium capitalize text-muted-foreground"
    >
      {status === "unavailable"
        ? "Status unavailable"
        : status
          ? generationStatusLabels[status]
          : "Draft"}
    </span>
  );
}
