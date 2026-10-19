import Link from "next/link";
import { creationCategories } from "@/components/creation/creation-options";
import type { ProjectSummary } from "@/lib/projects/types";
import type { GenerationStatus } from "@/lib/generation/contract";
import type { ProjectAsset } from "@/lib/media/types";
import { ProjectJobBadge } from "./project-job-statuses";
import { ProjectRename } from "./project-rename";
import { ProjectPreview } from "./project-preview";

export function ProjectCard({ project, jobStatus, preview }: {
  project: ProjectSummary;
  jobStatus?: GenerationStatus | "unavailable" | null;
  preview?: ProjectAsset | null;
}) {
  const category = creationCategories.find(item => item.id === project.category);
  const Icon = category?.icon;
  return <article className="workspace-project-card">
    <Link href={`/projects/${project.id}`} prefetch={false} className="workspace-project-open" aria-label={`Open ${project.title}`}>
      <div className="workspace-project-preview">
        <ProjectPreview asset={preview}>
          <div className="workspace-project-placeholder">
            {Icon && <Icon aria-hidden="true" />}
            <span>{category?.title || "Project draft"}</span>
            <span>No preview yet</span>
          </div>
        </ProjectPreview>
        <div className="workspace-project-status"><ProjectJobBadge projectId={project.id} initialStatus={jobStatus} /></div>
      </div>
      <h3>{project.title}</h3>
      <time dateTime={project.updatedAt}>Edited {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(project.updatedAt))}</time>
      <span className="workspace-project-open-label">Open</span>
    </Link>
    <div className="workspace-project-actions"><ProjectRename projectId={project.id} title={project.title} /></div>
  </article>;
}
