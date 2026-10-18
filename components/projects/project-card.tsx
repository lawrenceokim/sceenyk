import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { creationCategories } from "@/components/creation/creation-options";
import type { ProjectSummary } from "@/lib/projects/types";
import type { GenerationStatus } from "@/lib/generation/contract";
import { ProjectJobBadge } from "./project-job-statuses";

export function ProjectCard({
  project,
  jobStatus,
}: {
  project: ProjectSummary;
  jobStatus?: GenerationStatus | "unavailable" | null;
}) {
  const category = creationCategories.find(
    (item) => item.id === project.category,
  );
  const Icon = category?.icon;
  return (
    <Link
      href={`/projects/${project.id}`}
      prefetch={false}
      className="sceenyk-interactive block min-w-0 rounded-xl border border-border bg-card p-5 text-card-foreground"
      aria-label={`Open ${project.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
          {Icon && <Icon className="size-5" aria-hidden="true" />}
        </span>
        <ProjectJobBadge projectId={project.id} initialStatus={jobStatus} />
      </div>
      <h3 className="mt-4 break-words text-body font-semibold">
        {project.title}
      </h3>
      <p className="mt-1 text-body-sm text-muted-foreground">
        {category?.title}
      </p>
      <p className="mt-3 text-caption text-muted-foreground">
        {project.settings.aspectRatio} · {project.settings.duration} sec ·{" "}
        {project.settings.visualStyle}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
        <time
          dateTime={project.updatedAt}
          className="text-caption text-muted-foreground"
        >
          Updated{" "}
          {new Intl.DateTimeFormat("en", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          }).format(new Date(project.updatedAt))}
        </time>
        <span className="inline-flex items-center gap-1 text-body-sm font-medium text-link">
          Open project
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
