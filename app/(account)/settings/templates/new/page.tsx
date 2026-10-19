import { SettingsSection } from "@/components/settings/settings-section";
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
    } catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/settings/templates/new" />; }
    if (!project) return <p role="alert">This project is unavailable. Choose a project you own.</p>;
    return <ListingEditor clerkUserId={user.clerk_user_id} project={project} listing={listing ?? undefined} />;
  }
  const page = typeof params.page === "string" && /^\d{1,6}$/.test(params.page) ? Math.max(1, Math.min(100000, Number(params.page))) : 1;
  let result;
  try { result = await listOwnedProjects(page); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/settings/templates/new" />; }
  return <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-5 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="text-xl font-semibold">Choose a saved project</h2><p className="text-body-sm text-muted-foreground">Its creative settings become the template. You’ll write separate public instructions and confirm your rights before publishing.</p>{result.projects.length ? <ul className="divide-y divide-border">{result.projects.map(project => <li key={project.id}><Link href={`/settings/templates/new?project=${project.id}`} className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link flex min-h-14 justify-between
      gap-3 py-3 [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}><span className="min-w-0 break-words font-medium">{project.title}</span><span className="shrink-0 text-caption text-muted-foreground">{project.settings.aspectRatio} · {project.settings.duration}s</span></Link></li>)}</ul> : <p className="text-muted-foreground">Save a project in the creation workspace first.</p>}<MarketplacePagination {...result} href={page => `/settings/templates/new?page=${page}`} /><Link href="/studio" className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link text-link
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}>Create a project</Link></section>;
}
export default function PublishPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <SettingsSection title="Publish to Marketplace" description="Turn a saved project into a reusable template."><Suspense fallback={<MarketplaceLoading />}><NewListing searchParams={searchParams} /></Suspense></SettingsSection>;
}
