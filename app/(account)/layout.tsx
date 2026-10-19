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
          className="sceenyk-container py-10 text-muted-foreground"
        >
          Opening your workspace…
        </p>
      }
    >
      <ProtectedWorkspace>{children}</ProtectedWorkspace>
    </Suspense>
  );
}
