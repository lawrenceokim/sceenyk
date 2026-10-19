import Link from "next/link";
import type { ProjectSummary } from "@/lib/projects/types";
import type { GenerationStatus } from "@/lib/generation/contract";
import type { ProjectAsset } from "@/lib/media/types";
import { ProjectJobBadge } from "./project-job-statuses";
import { ProjectRename } from "./project-rename";
import { ProjectDeleteUnavailable } from "./project-delete";
import { ProjectPreview } from "./project-preview";
import { AbstractPreview } from "@/components/marketplace/abstract-preview";
import { projectPreviewColor, templateAppearance } from "@/components/marketplace/template-appearance";

export function ProjectCard({ project, jobStatus, preview }: {
  project: ProjectSummary;
  jobStatus?: GenerationStatus | "unavailable" | null;
  preview?: ProjectAsset | null;
}) {
  const fallbackColor = projectPreviewColor(project.id);
  return <article className="workspace-project-card" style={templateAppearance({ id: project.id, fallbackColor })}>
    <Link href={`/projects/${project.id}`} prefetch={false} className="workspace-project-open" aria-label={`Open ${project.title}`}>
      <div className="workspace-project-preview">
        <ProjectPreview asset={preview}>
          <AbstractPreview previewId={project.id} fallbackColor={fallbackColor} label="Project preview" ariaLabel="Abstract project placeholder; not generated media" />
        </ProjectPreview>
        <div className="workspace-project-status"><ProjectJobBadge projectId={project.id} initialStatus={jobStatus} /></div>
      </div>
      <h3>{project.title}</h3>
      <time dateTime={project.updatedAt}>Edited {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(project.updatedAt))}</time>
      <span className="workspace-project-open-label">Open</span>
    </Link>
    <div className="workspace-project-actions">
      <span className="workspace-project-action"><ProjectRename projectId={project.id} title={project.title} /></span>
      <span className="workspace-project-action"><ProjectDeleteUnavailable title={project.title} /></span>
    </div>
  </article>;
}
