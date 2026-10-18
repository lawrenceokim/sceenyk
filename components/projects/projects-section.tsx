import Link from "next/link";
import { FolderOpen, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ProjectCard } from "./project-card";
import type { ProjectPage } from "@/lib/projects/types";
import type { GenerationStatus } from "@/lib/generation/contract";

export function ProjectsSection({
  data,
  jobStatuses,
}: {
  data: ProjectPage;
  jobStatuses: Record<string, GenerationStatus | "unavailable" | null>;
}) {
  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));
  return (
    <section
      id="projects"
      tabIndex={-1}
      aria-labelledby="projects-heading"
      className="scroll-mt-8 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <div className="workspace-projects-header">
        <h2
          id="projects-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Your projects
        </h2>
        <span className="text-caption text-muted-foreground">
          {data.total.toLocaleString()} {data.total === 1 ? "draft" : "drafts"}{" "}
          · newest first
        </span>
      </div>
      {data.total === 0 ? (
        <EmptyState
          icon={<FolderOpen className="size-7" />}
          title="No projects yet"
          description="Save a creative brief in Studio, then return here to pick up where you left off."
          primaryAction={
            <Button
              nativeButton={false}
              render={<Link href="/studio" />}
              className="h-auto min-h-11 whitespace-normal text-center"
            >
              <Plus className="size-4" aria-hidden="true" />
              Create your first project
            </Button>
          }
        />
      ) : data.projects.length === 0 ? (
        <EmptyState
          title="No projects on this page"
          description="Return to your latest saved drafts."
          primaryAction={
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/dashboard/projects" />}
            >
              Latest projects
            </Button>
          }
        />
      ) : (
        <>
          <ul
            className="workspace-gallery py-3"
            aria-label="Saved projects"
          >
            {data.projects.map((project) => (
              <li key={project.id} className="min-w-0">
                <ProjectCard
                  project={project}
                  jobStatus={jobStatuses[project.id]}
                />
              </li>
            ))}
          </ul>
          {lastPage > 1 && (
            <nav
              aria-label="Project pagination"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-5 sm:px-6"
            >
              {data.page > 1 ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      href={`/dashboard/projects?page=${data.page - 1}`}
                      prefetch={false}
                    />
                  }
                >
                  Previous
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Previous
                </Button>
              )}
              <span className="text-caption text-muted-foreground">
                Page {data.page} of {lastPage}
              </span>
              {data.page < lastPage ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={
                    <Link
                      href={`/dashboard/projects?page=${data.page + 1}`}
                      prefetch={false}
                    />
                  }
                >
                  Next
                </Button>
              ) : (
                <Button variant="outline" disabled>
                  Next
                </Button>
              )}
            </nav>
          )}
        </>
      )}
    </section>
  );
}

