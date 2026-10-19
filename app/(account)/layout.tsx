import { WorkspacePageFrame } from "@/components/workspace/workspace-page-frame";
import { Suspense, type ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { WorkspaceUnavailable } from "@/components/dashboard/workspace-unavailable";
import { AppUserSyncError, ensureAppUser } from "@/lib/auth/ensure-app-user";

async function ProtectedWorkspace({ children }: { children: ReactNode }) {
  try {
    await ensureAppUser();
  } catch (error: unknown) {
    // Auth redirects still propagate; only identity-sync failures use this UI.
    if (!(error instanceof AppUserSyncError)) throw error;
    return (
      <WorkspaceShell>
        <WorkspaceUnavailable />
      </WorkspaceShell>
    );
  }
  return (
    <WorkspaceShell>
      <WorkspacePageFrame>{children}</WorkspacePageFrame>
    </WorkspaceShell>
  );
}

export default function AccountWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <p
          role="status"
          className={`
      [@layer_components]:w-[100%] [@layer_components]:max-w-[var(--content-width)] [@layer_components]:ml-[auto]
      [@layer_components]:mr-[auto] [@layer_components]:pl-[var(--page-gutter)] [@layer_components]:pr-[var(--page-gutter)]
      sceenyk-container py-10 text-muted-foreground
    `}
        >
          Opening your workspace…
        </p>
      }
    >
      <ProtectedWorkspace>{children}</ProtectedWorkspace>
    </Suspense>
  );
}
