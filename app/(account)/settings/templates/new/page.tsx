import { ProjectPickerSkeleton } from "@/components/marketplace/gallery-skeletons";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { redirect, unstable_rethrow } from "next/navigation";
import { SettingsSection } from "@/components/settings/settings-section";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { getOwnedProject, listOwnedProjects } from "@/lib/projects/server";
import { getOwnedProjectTemplates } from "@/lib/marketplace/project-template";
import { listOwnedAssets, MediaAccessError } from "@/lib/media/server";
import { ProjectPreview } from "@/components/projects/project-preview";
import { ProjectPublish } from "@/components/projects/project-publish";
import { TemplateAccountBoundary } from "@/components/templates/template-account-boundary";
import { AbstractPreview } from "@/components/marketplace/abstract-preview";
import { projectPreviewColor } from "@/components/marketplace/template-appearance";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
import { MarketplacePagination } from "@/components/marketplace/pagination";

export const metadata: Metadata = { title: "New Template — Sceenyk", robots: { index: false, follow: false } };
async function NewListing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await ensureAppUser();
  const page = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Math.min(100000, Number(params.page))) : 1;
  let result, templateIds, previews;
  let unavailable = false;
  try {
    if (typeof params.project === "string") {
      const project = await getOwnedProject(params.project);
      unavailable = !project;
      result = { projects: project ? [project] : [], total: project ? 1 : 0, page: 1, pageSize: 8 };
    } else result = await listOwnedProjects(page);
    templateIds = await getOwnedProjectTemplates(result.projects.map(project => project.id));
    previews = Object.fromEntries(await Promise.all(result.projects.map(async project => {
      try {
        const assets = await listOwnedAssets(project.id);
        return [project.id, assets.find(asset => !asset.removedFromDraft && asset.status === "uploaded" && (asset.kind === "image" || asset.kind === "video")) ?? null];
      } catch (error) {
        if (!(error instanceof MediaAccessError)) throw error;
        return [project.id, null];
      }
    })));
  } catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/settings/templates/new" />; }
  if (unavailable) return <p role="alert">This project is unavailable. Choose a project you own.</p>;
  if (typeof params.project === "string" && templateIds[params.project]) redirect(`/settings/templates/${templateIds[params.project]}`);
  return <TemplateAccountBoundary clerkUserId={user.clerk_user_id} fallback={<ProjectPickerSkeleton />}>
    <section className="min-w-0 space-y-5">
      <p className="text-sm text-muted-foreground">Choose a saved project. Review its template details before publishing to Marketplace.</p>
      {result.projects.length ? <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
        {result.projects.map(project => <li key={project.id} className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
          <div className="relative aspect-[4/3] overflow-hidden bg-muted [&_img]:object-cover [&_video]:size-full [&_video]:object-cover">
            <ProjectPreview asset={previews[project.id]}><AbstractPreview previewId={project.id} fallbackColor={projectPreviewColor(project.id)} label="Project preview" /></ProjectPreview>
          </div>
          <div className="min-w-0 space-y-1 p-3">
            <h2 className="break-words text-sm font-semibold">{project.title}</h2>
            <time className="block text-xs text-muted-foreground" dateTime={project.updatedAt}>Edited {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(project.updatedAt))}</time>
            <ProjectPublish projectId={project.id} listingId={templateIds[project.id]} />
          </div>
        </li>)}
      </ul> : <p className="text-sm text-muted-foreground">Save a project in Studio first.</p>}
      <MarketplacePagination {...result} href={nextPage => `/settings/templates/new?page=${nextPage}`} />
      <Link href="/studio" className="inline-flex min-h-8 items-center text-xs text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Create a project</Link>
    </section>
  </TemplateAccountBoundary>;
}
export default function PublishPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <SettingsSection title="New Template" description="Start with one of your Projects."><Suspense fallback={<ProjectPickerSkeleton />}><NewListing searchParams={searchParams} /></Suspense></SettingsSection>;
}
