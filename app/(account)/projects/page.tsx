import { ProjectsHeading } from "@/components/projects/projects-heading";
import type { Metadata } from "next";
import { Suspense } from "react";
import { AppUserSyncError } from "@/lib/auth/ensure-app-user";
import { requireClerkUser } from "@/lib/auth/require-user";
import { listOwnedProjects, ProjectAccessError } from "@/lib/projects/server";
import { WorkspaceUnavailable } from "@/components/dashboard/workspace-unavailable";
import { listOwnedAssets, MediaAccessError } from "@/lib/media/server";
import { ProjectsGallerySkeleton, ProjectsSection } from "@/components/projects/projects-section";
import {
  GenerationAccessError,
  getLatestProjectGenerations,
} from "@/lib/generation/server";
import type { GenerationStatus } from "@/lib/generation/contract";
import { ProjectJobStatusesProvider } from "@/components/projects/project-job-statuses";
import { ProjectsAccountFence } from "@/components/projects/projects-account-fence";
import { getOwnedProjectTemplates } from "@/lib/marketplace/project-template";
import { unstable_rethrow } from "next/navigation";

export const metadata: Metadata = {
  title: "Projects — Sceenyk",
  description:
    "Explore the Sceenyk creative workspace: project library, generation activity, and creation tools.",
};

type ProjectsPageProps = {
  searchParams: Promise<{ page?: string | string[] }>;
};

async function OwnedProjects({
  searchParams,
}: ProjectsPageProps) {
  const { page } = await searchParams;
  const { userId } = await requireClerkUser();
  let projects;
  try {
    projects = await listOwnedProjects(
      typeof page === "string" ? Number(page) : 1,
    );
  } catch (error: unknown) {
    if (
      error instanceof ProjectAccessError ||
      error instanceof AppUserSyncError
    )
      return <WorkspaceUnavailable />;
    throw error;
  }
  let jobStatuses: Record<string, GenerationStatus | "unavailable" | null> = {};
  try {
    const jobs = await getLatestProjectGenerations(
      projects.projects.map(({ id }) => id),
    );
    jobStatuses = Object.fromEntries(
      projects.projects.map(({ id }) => [id, jobs[id]?.status ?? null]),
    );
  } catch (error: unknown) {
    if (
      error instanceof GenerationAccessError ||
      error instanceof AppUserSyncError
    )
      jobStatuses = Object.fromEntries(
        projects.projects.map(({ id }) => [id, "unavailable"]),
      );
    else throw error;
  }
  const previews = Object.fromEntries(await Promise.all(projects.projects.map(async project => {
    try {
      const assets = await listOwnedAssets(project.id);
      return [project.id, assets.find(asset => !asset.removedFromDraft && asset.status === "uploaded" && (asset.kind === "image" || asset.kind === "video")) ?? null] as const;
    } catch (error) {
      if (!(error instanceof MediaAccessError || error instanceof AppUserSyncError)) throw error;
      return [project.id, null] as const;
    }
  })));
  let templateIds: Record<string, string> = {};
  try { templateIds = await getOwnedProjectTemplates(projects.projects.map(project => project.id)); }
  catch (error) { unstable_rethrow(error); /* Publish still resolves the existing listing on the server. */ }
  return (
    <ProjectsAccountFence clerkUserId={userId}>
      <ProjectJobStatusesProvider key={projects.projects.map(({ id }) => id).join(",")} initial={jobStatuses}>
        <ProjectsSection data={projects} jobStatuses={jobStatuses} previews={previews} templateIds={templateIds} />
      </ProjectJobStatusesProvider>
    </ProjectsAccountFence>
  );
}

export default function ProjectsPage({ searchParams }: ProjectsPageProps) {
  return <div className="workspace-projects">
    <ProjectsHeading />
    <Suspense fallback={<ProjectsGallerySkeleton />}>
      <OwnedProjects searchParams={searchParams} />
    </Suspense>
  </div>;
}
