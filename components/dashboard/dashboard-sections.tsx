import Link from "next/link";
import {
  ArrowUpRight,
  Clapperboard,
  Coins,
  FolderOpen,
  Layers3,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { SceneArtwork } from "@/components/scene-artwork";
import { DashboardStatCard } from "./dashboard-stat-card";

export function QuickCreate() {
  return (
    <section
      aria-labelledby="quick-create-heading"
      className="sceenyk-feature-card grid overflow-hidden md:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)]"
    >
      <div className="p-6 md:p-8">
        <p className="eyebrow flex items-center gap-2">
          <Sparkles className="size-4" aria-hidden="true" />
          START WITH A SPARK
        </p>
        <h2
          id="quick-create-heading"
          className="mt-4 max-w-lg text-heading-3 font-semibold tracking-tight md:text-heading-2"
        >
          An idea today.
          <br />
          Your next scene tomorrow.
        </h2>
        <p className="mt-3 max-w-md text-body-sm leading-relaxed text-muted-foreground">
          Explore a new story, transform a clip, or put a product in the
          spotlight. Your creative direction starts here.
        </p>
        <Button
          nativeButton={false}
          render={<Link href="/create" />}
          className="mt-6"
        >
          <Plus className="size-4" aria-hidden="true" />
          Create new content
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="relative hidden min-h-64 overflow-hidden border-l border-border md:block">
        <SceneArtwork className="absolute inset-0 h-full w-full" />
        <span className="absolute bottom-4 left-4 rounded-full bg-neutral-950/80 px-3 py-1.5 text-caption text-primary-foreground">
          Concept illustration
        </span>
      </div>
    </section>
  );
}

export function DashboardOverview() {
  return (
    <section aria-labelledby="overview-heading">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="overview-heading"
          className="text-lg font-semibold tracking-tight"
        >
          At a glance
        </h2>
        <p className="text-caption text-muted-foreground">
          Empty preview · no account data connected
        </p>
      </div>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStatCard
          icon={<FolderOpen className="size-5" />}
          label="Projects"
          value="0"
          description="No saved projects in this preview"
        />
        <DashboardStatCard
          icon={<Clapperboard className="size-5" />}
          label="Generations"
          value="0"
          description="No generation activity in this preview"
        />
        <DashboardStatCard
          icon={<Coins className="size-5" />}
          label="Available credits"
          value="—"
          description="Balance not connected"
        />
        <DashboardStatCard
          icon={<Layers3 className="size-5" />}
          label="Templates"
          value="0"
          description="No saved templates in this preview"
        />
      </dl>
    </section>
  );
}

export function ProjectsSection() {
  return (
    <section
      id="projects"
      tabIndex={-1}
      aria-labelledby="projects-heading"
      className="sceenyk-card scroll-mt-28 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5 sm:px-6">
        <h2
          id="projects-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Your projects
        </h2>
        <span className="text-caption text-muted-foreground">
          Project library preview
        </span>
      </div>
      <EmptyState
        icon={<FolderOpen className="size-7" />}
        title="No projects yet"
        description="Your projects will have a home here once saving is connected. For now, explore an idea in the creation workspace."
        primaryAction={
          <Button
            nativeButton={false}
            render={<Link href="/create" />}
            className="h-auto min-h-11 whitespace-normal text-center"
          >
            <Plus className="size-4" aria-hidden="true" />
            Create your first project
          </Button>
        }
      />
    </section>
  );
}

export function RecentGenerationsSection() {
  return (
    <section aria-labelledby="generations-heading" className="sceenyk-card">
      <div className="border-b border-border p-5 sm:px-6">
        <h2
          id="generations-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Recent generations
        </h2>
      </div>
      <EmptyState
        icon={<Clapperboard className="size-7" />}
        title="No generations yet"
        description="Processing and completed generations will appear here when generation is connected. Nothing is running in this preview."
      />
    </section>
  );
}

export function TemplatesSection() {
  return (
    <section
      id="templates"
      tabIndex={-1}
      aria-labelledby="templates-heading"
      className="sceenyk-card scroll-mt-28 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <div className="border-b border-border p-5 sm:px-6">
        <h2
          id="templates-heading"
          className="text-lg font-semibold tracking-tight"
        >
          Your templates
        </h2>
      </div>
      <EmptyState
        icon={<Layers3 className="size-7" />}
        title="No saved templates yet"
        description="A future home for your own templates, purchased styles, and marketplace finds. Template saving and the marketplace are coming later."
        secondaryAction={
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link href="/create" />}
          >
            Explore creation styles
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Button>
        }
      />
    </section>
  );
}

export function CreditsPreview() {
  return (
    <section
      id="credits"
      tabIndex={-1}
      aria-labelledby="credits-heading"
      className="sceenyk-card scroll-mt-28 p-6 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
          <Coins className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 id="credits-heading" className="text-body font-semibold">
            Room for your next idea
          </h2>
          <p className="mt-1 text-caption text-muted-foreground">
            Credits preview · balance unavailable
          </p>
        </div>
      </div>
      <p className="mt-5 text-body-sm leading-relaxed text-muted-foreground">
        New users will receive{" "}
        <span className="font-medium text-foreground">
          2 free short generations
        </span>
        . Paid plans or credits will support more creation afterward.
      </p>
      <p className="mt-3 text-caption leading-relaxed text-muted-foreground">
        This preview has no balance, free allowance tracking, or purchases.
      </p>
    </section>
  );
}
