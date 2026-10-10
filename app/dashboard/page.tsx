import type { Metadata } from "next";
import { AppUserSyncError } from "@/lib/auth/ensure-app-user";
import { listOwnedProjects, ProjectAccessError } from "@/lib/projects/server";
import { WorkspaceUnavailable } from "@/components/dashboard/workspace-unavailable";
import { DashboardGreeting } from "@/components/auth/account-controls";
import {
  GenerationAccessError,
  getLatestProjectGenerations,
} from "@/lib/generation/server";
import type { GenerationStatus } from "@/lib/generation/contract";
import { ProjectJobStatusesProvider } from "@/components/dashboard/project-job-statuses";
import {
  CreditsPreview,
  DashboardOverview,
  ProjectsSection,
  QuickCreate,
  RecentGenerationsSection,
  TemplatesSection,
} from "@/components/dashboard/dashboard-sections";

export const metadata: Metadata = {
  title: "Dashboard — Sceenyk",
  description:
    "Explore the Sceenyk creative workspace: project library, generation activity, and creation tools.",
};

export default async function DashboardPage({
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
  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="eyebrow">YOUR CREATIVE SPACE</p>
          <DashboardGreeting />
          <p className="mt-3 max-w-xl text-body text-muted-foreground">
            A home for the scenes you imagine, and the stories you’ll bring to
            life.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 rounded-full border border-border bg-accent px-3 py-2 text-caption font-medium text-accent-foreground">
          Your workspace
        </span>
      </div>
      <QuickCreate />
      <DashboardOverview projectCount={projects.total} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <ProjectJobStatusesProvider
            key={projects.projects.map(({ id }) => id).join(",")}
            initial={jobStatuses}
          >
            <ProjectsSection data={projects} jobStatuses={jobStatuses} />
          </ProjectJobStatusesProvider>
          <RecentGenerationsSection />
        </div>
        <div className="min-w-0 space-y-6">
          <CreditsPreview />
          <TemplatesSection />
        </div>
      </div>
      <p className="pb-2 text-caption leading-relaxed text-muted-foreground">
        Your creative briefs and generation requests are saved privately.
        Processing, templates and credits are coming later.
      </p>
    </>
  );
}
