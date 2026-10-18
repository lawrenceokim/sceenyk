import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { getOwnedProject, listOwnedProjects } from "@/lib/projects/server";
import { getOwnedMarketplaceListing } from "@/lib/marketplace/server";
import { ListingEditor } from "@/components/marketplace/listing-editor";
import { MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";
import { MarketplacePagination } from "@/components/marketplace/pagination";

export const metadata: Metadata = { title: "Publish a template — Sceenyk", robots: { index: false, follow: false } };
async function NewListing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const user = await ensureAppUser();
  if (typeof params.project === "string") {
    let project, listing;
    try {
      project = await getOwnedProject(params.project);
      listing = project ? await getOwnedMarketplaceListing(project.id, true) : null;
    } catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/dashboard/marketplace/new" />; }
    if (!project) return <p role="alert">This project is unavailable. Choose a project you own.</p>;
    return <ListingEditor clerkUserId={user.clerk_user_id} project={project} listing={listing ?? undefined} />;
  }
  const page = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Math.min(100000, Number(params.page))) : 1;
  let result;
  try { result = await listOwnedProjects(page); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/dashboard/marketplace/new" />; }
  return <section className="sceenyk-card space-y-5 p-5 sm:p-6"><h2 className="text-xl font-semibold">Choose a saved project</h2><p className="text-body-sm text-muted-foreground">Its creative settings become the template. You’ll write separate public instructions and confirm your rights before publishing.</p>{result.projects.length ? <ul className="divide-y divide-border">{result.projects.map(project => <li key={project.id}><Link href={`/dashboard/marketplace/new?project=${project.id}`} className="nav-link flex min-h-14 justify-between gap-3 py-3"><span className="min-w-0 break-words font-medium">{project.title}</span><span className="shrink-0 text-caption text-muted-foreground">{project.settings.aspectRatio} · {project.settings.duration}s</span></Link></li>)}</ul> : <p className="text-muted-foreground">Save a project in the creation workspace first.</p>}<MarketplacePagination {...result} href={page => `/dashboard/marketplace/new?page=${page}`} /><Link href="/studio" className="nav-link text-link">Create a project</Link></section>;
}
export default function PublishPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><WorkspacePageHeader title="Publish to Marketplace" eyebrow="SHARE YOUR CREATIVE APPROACH" description="Turn a saved project into a reusable template."></WorkspacePageHeader><Suspense fallback={<MarketplaceLoading />}><NewListing searchParams={searchParams} /></Suspense></>;
}
