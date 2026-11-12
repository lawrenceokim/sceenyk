import type { Metadata } from "next";
import { Suspense } from "react";
import { ProjectsHeading } from "@/components/projects/projects-heading";
import { WorkspaceGalleryPage } from "@/components/workspace/workspace-gallery-page";
import { ProjectsGalleryClient } from "@/components/projects/projects-gallery-client";
import { ProjectsGallerySkeleton } from "@/components/projects/projects-section";

export const metadata: Metadata = {
  title: "Projects — Sceenyk",
  description: "Explore the Sceenyk creative workspace: project library, generation activity, and creation tools.",
};

export default function ProjectsPage() {
  return <WorkspaceGalleryPage view="projects"><div className="workspace-projects">
    <ProjectsHeading />
    <Suspense fallback={<ProjectsGallerySkeleton />}><ProjectsGalleryClient /></Suspense>
  </div></WorkspaceGalleryPage>;
}
