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
        fallback={
          <p role="status" className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card p-6 text-muted-foreground
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}>
            Opening your draft…
          </p>
        }
      >
        <OwnedWorkspace params={params} />
      </Suspense>
    </div>
  );
}
