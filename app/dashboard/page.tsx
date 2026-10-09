import type { Metadata } from "next";
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

export default function DashboardPage() {
  return (
    <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <p className="eyebrow">YOUR CREATIVE SPACE</p>
          <h1 className="mt-3 text-heading-2 font-bold tracking-tight md:text-heading-1">
            Welcome to Sceenyk
          </h1>
          <p className="mt-3 max-w-xl text-body text-muted-foreground">
            A home for the scenes you imagine, and the stories you’ll bring to
            life.
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 rounded-full border border-border bg-accent px-3 py-2 text-caption font-medium text-accent-foreground">
          Dashboard preview
        </span>
      </div>
      <QuickCreate />
      <DashboardOverview />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <ProjectsSection />
          <RecentGenerationsSection />
        </div>
        <div className="min-w-0 space-y-6">
          <CreditsPreview />
          <TemplatesSection />
        </div>
      </div>
      <p className="pb-2 text-caption leading-relaxed text-muted-foreground">
        You’re exploring the workspace preview. Account access, saved projects,
        and generation are coming soon.
      </p>
    </>
  );
}
