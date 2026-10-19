import type { Metadata } from "next";
import { AppUserSyncError } from "@/lib/auth/ensure-app-user";
import { requireClerkUser } from "@/lib/auth/require-user";
import { listOwnedProjects, ProjectAccessError } from "@/lib/projects/server";
import { WorkspaceUnavailable } from "@/components/dashboard/workspace-unavailable";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listOwnedAssets, MediaAccessError } from "@/lib/media/server";
import { ProjectsSection } from "@/components/projects/projects-section";
import {
  GenerationAccessError,
  getLatestProjectGenerations,
} from "@/lib/generation/server";
import type { GenerationStatus } from "@/lib/generation/contract";
import { ProjectJobStatusesProvider } from "@/components/projects/project-job-statuses";
import { ProjectsAccountFence } from "@/components/projects/projects-account-fence";
import "@/components/projects/projects.css";

export const metadata: Metadata = {
  title: "Projects — Sceenyk",
  description:
    "Explore the Sceenyk creative workspace: project library, generation activity, and creation tools.",
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
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
      return [project.id, assets.find(asset => asset.status === "uploaded" && (asset.kind === "image" || asset.kind === "video")) ?? null] as const;
    } catch (error) {
      if (!(error instanceof MediaAccessError || error instanceof AppUserSyncError)) throw error;
      return [project.id, null] as const;
    }
  })));
  return <div className="workspace-projects">
    <header className="workspace-projects-heading">
      <div><h1>My Projects</h1><p>Projects you&apos;ve saved. Open one to pick up right where you left off.</p></div>
      <Button nativeButton={false} render={<Link href="/studio" />}><Plus aria-hidden="true" />New Project</Button>
    </header>
    <ProjectsAccountFence clerkUserId={userId}><ProjectJobStatusesProvider key={projects.projects.map(({ id }) => id).join(",")} initial={jobStatuses}>
      <ProjectsSection data={projects} jobStatuses={jobStatuses} previews={previews} />
    </ProjectJobStatusesProvider></ProjectsAccountFence>
    <aside id="templates" className="workspace-projects-template-link">Reusable listings live in <Link href="/templates" className="text-link">Templates</Link>. Find more starting points in <Link href="/marketplace" className="text-link">Marketplace</Link>.</aside>
  </div>;
}
