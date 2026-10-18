import type { Metadata } from "next";
import { AppUserSyncError } from "@/lib/auth/ensure-app-user";
import { listOwnedProjects, ProjectAccessError } from "@/lib/projects/server";
import { WorkspaceUnavailable } from "@/components/dashboard/workspace-unavailable";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ProjectsSection } from "@/components/projects/projects-section";
import {
  GenerationAccessError,
  getLatestProjectGenerations,
} from "@/lib/generation/server";
import type { GenerationStatus } from "@/lib/generation/contract";
import { ProjectJobStatusesProvider } from "@/components/projects/project-job-statuses";

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
  return <div className="space-y-8">
    <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div className="space-y-3"><p className="eyebrow">YOUR WORKSPACE</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Projects</h1><p className="text-muted-foreground">Pick up a saved draft, or start your next scene in Studio.</p></div>
      <Button nativeButton={false} render={<Link href="/create" />}>Open Studio</Button>
    </header>
    <ProjectJobStatusesProvider key={projects.projects.map(({ id }) => id).join(",")} initial={jobStatuses}>
      <ProjectsSection data={projects} jobStatuses={jobStatuses} />
    </ProjectJobStatusesProvider>
    <section id="templates" className="scroll-mt-8 border-t border-border pt-6" aria-labelledby="templates-heading"><h2 id="templates-heading" className="text-lg font-semibold">Templates</h2><p className="mt-2 text-body-sm text-muted-foreground">Find your existing reusable listings in <Link href="/dashboard/templates" className="text-link underline underline-offset-4">Templates</Link>, or explore creator templates in <Link href="/marketplace" className="text-link underline underline-offset-4">Marketplace</Link>.</p></section>
  </div>;
}
