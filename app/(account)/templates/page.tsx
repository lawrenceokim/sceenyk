import { TemplatesHeading } from "@/components/templates/templates-heading";
import { WorkspaceGalleryPage } from "@/components/workspace/workspace-gallery-page";
import { Suspense } from "react";
import type { Metadata } from "next";
import { TemplatesGalleryClient } from "@/components/templates/templates-gallery-client";
import { GallerySkeleton } from "@/components/marketplace/gallery-skeletons";

export const metadata: Metadata = { title: "Templates — Sceenyk", robots: { index: false, follow: false } };

export default function TemplatesPage() {
  return (
    <WorkspaceGalleryPage view="templates"><div className={`
      workspace-templates
      [&&_>_#templates]:mt-[40px] max-599:[&&_>_#templates]:mt-[24px]
    `}>
      <TemplatesHeading />
      <Suspense fallback={<GallerySkeleton variant="library" />}><TemplatesGalleryClient /></Suspense>

    </div></WorkspaceGalleryPage>
  );
}
