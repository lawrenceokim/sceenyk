import { StudioSkeleton } from "@/components/creation/studio-skeleton";
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
import {
  GenerationAccessError,
  getLatestProjectGeneration,
} from "@/lib/generation/server";
import type { GenerationJob } from "@/lib/generation/types";
import { getOwnedProjectOrigin, MarketplaceAccessError } from "@/lib/marketplace/server";
import type { ProjectOrigin } from "@/lib/marketplace/contract";
import { isOwnedV3Project, readOwnedV3 } from "@/lib/final-video-generation-v3/runtime-server";
import { v3LocalEnabled } from "@/lib/final-video-generation-v3/runtime-config";
import { V3Studio } from "@/components/creation/v3-studio";
import { unstable_rethrow } from "next/navigation";

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
  let v3;
  try { v3 = await isOwnedV3Project(project.id); }
  catch (error) { unstable_rethrow(error); return <ProjectLoadFailure />; }
  if (v3) {
    if (!v3LocalEnabled()) return <p className="p-6 text-sm text-muted-foreground">This V3 project requires the local V3 workspace configuration.</p>;
    const initial = await readOwnedV3(project.id);
    return <V3Studio initial={initial} />;
  }
  let origin: ProjectOrigin | null = null;
  try { origin = await getOwnedProjectOrigin(project.id); }
  catch (error) {
    // Existing projects remain usable if the new migration is not deployed yet.
    if (!(error instanceof MarketplaceAccessError || error instanceof AppUserSyncError)) throw error;
  }
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
  let generation: GenerationJob | null = null;
  let generationError = "";
  try {
    generation = await getLatestProjectGeneration(project.id);
  } catch (error: unknown) {
    if (
      error instanceof GenerationAccessError ||
      error instanceof AppUserSyncError
    )
      generationError =
        "Your project opened, but generation status couldn’t be loaded. Check status to try again.";
    else throw error;
  }
  return (
    <CreationWorkspace
      key={project.id}
      initialProject={project}
      viewerUserId={userId}
      initialAssets={assets}
      initialMediaError={mediaError}
      initialGeneration={generation}
      initialGenerationError={generationError}
      initialOrigin={origin}
    />
  );
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <div className="min-w-0">
      <CreationHeader saved />
      <Suspense
        fallback={<StudioSkeleton />}
      >
        <OwnedWorkspace params={params} />
      </Suspense>
    </div>
  );
}
