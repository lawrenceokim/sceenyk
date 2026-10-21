import Link from "next/link";
import type { ProjectSummary } from "@/lib/projects/types";
import type { GenerationStatus } from "@/lib/generation/contract";
import type { ProjectAsset } from "@/lib/media/types";
import { ProjectJobBadge } from "./project-job-statuses";
import { ProjectRename } from "./project-rename";
import { ProjectDelete } from "./project-delete";
import { ProjectPublish } from "./project-publish";
import { ProjectPreview } from "./project-preview";
import { AbstractPreview } from "@/components/marketplace/abstract-preview";
import { projectPreviewColor, templateAppearance } from "@/components/marketplace/template-appearance";

export function ProjectCard({ project, jobStatus, preview, listingId }: {
  project: ProjectSummary;
  jobStatus?: GenerationStatus | "unavailable" | null;
  preview?: ProjectAsset | null;
  listingId?: string;
}) {
  const fallbackColor = projectPreviewColor(project.id);
  return <article className={`
      workspace-project-card [&&]:block [&&]:min-w-[0] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[14px]
      [&&]:pt-[12px] [&&]:pr-[12px] [&&]:pb-[12px] [&&]:pl-[12px] [&&]:[background:var(--card)] [&&_h3]:text-[length:14px]
      [&&_>_*_+_*]:mt-[8px] [.workspace-project-grid_&&]:relative [.workspace-project-grid_&&]:block
      [.workspace-project-grid_&&]:min-w-[0] [.workspace-project-grid_&&]:pt-[10px] [.workspace-project-grid_&&]:pr-[10px]
      [.workspace-project-grid_&&]:pb-[10px] [.workspace-project-grid_&&]:pl-[10px]
      [.workspace-project-grid_&&]:[border:1px_solid_var(--border)] [.workspace-project-grid_&&]:rounded-[13px]
      [.workspace-project-grid_&&]:[background:linear-gradient(180deg,_color-mix(in_srgb,_var(--template-color)_32%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color)_24%,_var(--card))_65%,_var(--card)_100%)]
      [.workspace-project-grid_&&]:[transition:transform_var(--motion-popover)_var(--motion-ease)]
      [.dark_.workspace-project-grid_&&]:[background:linear-gradient(180deg,_color-mix(in_srgb,_var(--template-color)_44%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color)_30%,_var(--card))_65%,_var(--card)_100%)]
      [&&:hover]:[transform:translateY(-2px)] [&&:has(.workspace-project-open:focus-visible)]:[outline:2px_solid_var(--ring)]
      [&&:has(.workspace-project-open:focus-visible)]:[outline-offset:3px] [.workspace-project-grid_&&_h3]:mt-[10px]
      [.workspace-project-grid_&&_h3]:mr-[4px] [.workspace-project-grid_&&_h3]:mb-[0]
      [.workspace-project-grid_&&_h3]:ml-[4px] [.workspace-project-grid_&&_h3]:text-[length:12px]
      [.workspace-project-grid_&&_h3]:leading-[18px] [.workspace-project-grid_&&_h3]:font-[600]
      [.workspace-project-grid_&&_h3]:[overflow-wrap:anywhere] [&&_time]:block [&&_time]:mt-[2px] [&&_time]:mr-[4px]
      [&&_time]:mb-[0] [&&_time]:ml-[4px] [&&_time]:text-[length:10px] [&&_time]:leading-[16px]
      [&&_time]:text-[color:var(--muted-foreground)] [@media_(prefers-reduced-motion:_reduce)]:[&&]:[transition:none]
      [@media_(prefers-reduced-motion:_reduce)]:[&&:hover]:[transform:none]
    `} style={templateAppearance({ id: project.id, fallbackColor })}>
    <Link href={`/projects/${project.id}`} prefetch={false} className={`
      workspace-project-open [&&]:block [&&]:[outline:none] [&&::after]:[content:''] [&&::after]:absolute [&&::after]:top-[0]
      [&&::after]:right-[0] [&&::after]:bottom-[0] [&&::after]:left-[0] [&&::after]:rounded-[inherit]
    `} aria-label={`Open ${project.title}`}>
      <div className={`
      workspace-project-preview [&&]:relative [&&]:w-[100%] [&&]:[aspect-ratio:4/3] [&&]:overflow-hidden [&&]:rounded-[9px]
      [&&]:[background:var(--template-color)] [&&_:is(img,_video)]:w-[100%] [&&_:is(img,_video)]:h-[100%]
      [&&_:is(img,_video)]:object-cover
    `}>
        <ProjectPreview asset={preview}>
          <AbstractPreview previewId={project.id} fallbackColor={fallbackColor} label="Project preview" ariaLabel="Abstract project placeholder; not generated media" />
        </ProjectPreview>
        <div className={`
      workspace-project-status [&&]:absolute [&&]:top-[6px] [&&]:right-[6px] [&&]:pointer-events-none [&&_>_span]:block
      [&&_>_span]:pt-[2px] [&&_>_span]:pr-[5px] [&&_>_span]:pb-[2px] [&&_>_span]:pl-[5px] [&&_>_span]:text-[length:9px]
      [&&_>_span]:leading-[14px] [&&_>_span]:[background:var(--card)]
    `}><ProjectJobBadge projectId={project.id} initialStatus={jobStatus} /></div>
      </div>
      <h3>{project.title}</h3>
      <time dateTime={project.updatedAt}>Edited {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(project.updatedAt))}</time>
    </Link>
    <div className="relative z-10 mt-2 flex min-w-0 flex-wrap items-center gap-x-1">
      <Link href={`/projects/${project.id}`} prefetch={false} className="inline-flex min-h-[30px] items-center px-1 text-[11px] font-medium outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11">Open</Link>
      <ProjectPublish projectId={project.id} listingId={listingId} compact />
      <div className="workspace-project-actions ml-auto flex shrink-0 items-center gap-1">
      <span className={"workspace-project-action [.workspace-project-actions_>_&&]:flex [.workspace-project-actions_>_&&]:items-center [.workspace-project-actions_>_&&]:justify-center [.workspace-project-actions_>_&&]:min-w-[0]"}><ProjectRename projectId={project.id} title={project.title} /></span>
      <span className={"workspace-project-action [.workspace-project-actions_>_&&]:flex [.workspace-project-actions_>_&&]:items-center [.workspace-project-actions_>_&&]:justify-center [.workspace-project-actions_>_&&]:min-w-[0]"}><ProjectDelete projectId={project.id} title={project.title} /></span>
      </div>
    </div>
  </article>;
}
