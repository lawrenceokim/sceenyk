"use client";
import type { ProjectCardStatus } from "@/lib/projects/card-status";
import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import {
  generationStatusLabels,
} from "@/lib/generation/contract";

export type ProjectJobStatuses = Record<string, ProjectCardStatus>;
const Statuses = createContext<ProjectJobStatuses>({});

// The Projects gallery owns revision checks and patches only changed statuses.
export function ProjectJobStatusesProvider({
  initial,
  children,
}: {
  initial: ProjectJobStatuses;
  children: ReactNode;
}) {
  return <Statuses.Provider value={initial}>{children}</Statuses.Provider>;
}
export function useProjectCardStatus(projectId: string, initialStatus?: ProjectCardStatus) {
  const statuses = useContext(Statuses);
  return projectId in statuses ? statuses[projectId] : initialStatus;
}

export function ProjectJobBadge({
  projectId,
  initialStatus,
}: {
  projectId: string;
  initialStatus?: ProjectCardStatus;
}) {
  const status = useProjectCardStatus(projectId, initialStatus);
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
