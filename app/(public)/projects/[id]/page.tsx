import { Suspense } from "react";
import type { Metadata } from "next";
import { CreationHeader } from "@/components/creation/creation-header";
import { CreationWorkspace } from "@/components/creation/creation-workspace";
import { ProjectLoadFailure } from "@/components/creation/project-load-failure";
import { ProjectUnavailable } from "@/components/creation/project-unavailable";
import { requireClerkUser } from "@/lib/auth/require-user";
import { AppUserSyncError } from "@/lib/auth/ensure-app-user";
import { getOwnedProject, ProjectAccessError } from "@/lib/projects/server";
import { listOwnedAssets, MediaAccessError } from "@/lib/media/server";
import type { ProjectAsset } from "@/lib/media/types";

export const metadata: Metadata = {
  title: "Project draft — Sceenyk",
  robots: { index: false, follow: false },
};

async function OwnedWorkspace({ params }: { params: Promise<{ id: string }> }) {
  const { userId } = await requireClerkUser();
  const { id } = await params;
  let project;
  try {
    project = await getOwnedProject(id);
  } catch (error: unknown) {
    if (
      error instanceof ProjectAccessError ||
      error instanceof AppUserSyncError
    )
      return <ProjectLoadFailure />;
    throw error;
  }
  // Missing and foreign projects are expected results. Keep the streamed
  // boundary/provider intact rather than interrupting it with a render error.
  if (!project) return <ProjectUnavailable />;
  let assets: ProjectAsset[] = [];
  let mediaError = "";
  try {
    assets = await listOwnedAssets(project.id);
  } catch (error: unknown) {
    if (error instanceof MediaAccessError || error instanceof AppUserSyncError)
      mediaError =
        "Your project opened, but its media couldn’t be loaded. Refresh to try again.";
    else throw error;
  }
  return (
    <CreationWorkspace
      key={project.id}
      initialProject={project}
      viewerUserId={userId}
      initialAssets={assets}
      initialMediaError={mediaError}
    />
  );
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="sceenyk-container py-8 md:py-12">
      <CreationHeader saved />
      <Suspense
        fallback={
          <p role="status" className="sceenyk-card p-6 text-muted-foreground">
            Opening your draft…
          </p>
        }
      >
        <OwnedWorkspace params={params} />
      </Suspense>
    </div>
  );
}
