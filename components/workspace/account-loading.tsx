"use client";

import { usePathname } from "next/navigation";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { SettingsLoading } from "@/components/settings/settings-loading";
import { CreditsWorkspace } from "@/components/credits/credits-workspace";
import { CreditAccountSkeleton, EarningsSkeleton, PurchasesSkeleton } from "@/components/payments/financial-skeletons";
import { GallerySkeleton } from "@/components/marketplace/gallery-skeletons";
import { TemplateDetailSkeleton } from "@/components/marketplace/detail-skeletons";
import { ProjectsHeading } from "@/components/projects/projects-heading";
import { ProjectsGallerySkeleton } from "@/components/projects/projects-section";
import { TemplatesHeading } from "@/components/templates/templates-heading";
import { WorkspaceGalleryPage } from "./workspace-gallery-page";

export function AccountLoading() {
  const pathname = usePathname();
  if (pathname.startsWith("/settings")) return <SettingsWorkspace><SettingsLoading /></SettingsWorkspace>;
  if (pathname.startsWith("/credits")) return <CreditsWorkspace>{pathname === "/credits/earnings" ? <EarningsSkeleton /> : <CreditAccountSkeleton />}</CreditsWorkspace>;
  if (pathname.startsWith("/templates/")) return <TemplateDetailSkeleton owned />;
  if (pathname === "/templates") return <WorkspaceGalleryPage view="templates"><div className="workspace-templates [&&_>_#templates]:mt-[40px] max-599:[&&_>_#templates]:mt-[24px]"><TemplatesHeading /><GallerySkeleton variant="library" /></div></WorkspaceGalleryPage>;
  if (pathname === "/projects") return <WorkspaceGalleryPage view="projects"><div className="workspace-projects"><ProjectsHeading /><ProjectsGallerySkeleton /></div></WorkspaceGalleryPage>;
  return <PurchasesSkeleton />;
}
