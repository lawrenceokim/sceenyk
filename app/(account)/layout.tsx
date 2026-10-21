import { AccountLoading } from "@/components/workspace/account-loading";
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
    return <WorkspaceUnavailable />;
  }
  return children;
}

export default function AccountWorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <WorkspaceShell>
      <WorkspacePageFrame>
        <Suspense fallback={<AccountLoading />}>
          <ProtectedWorkspace>{children}</ProtectedWorkspace>
        </Suspense>
      </WorkspacePageFrame>
    </WorkspaceShell>
  );
}
