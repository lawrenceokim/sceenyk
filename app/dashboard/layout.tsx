import { Suspense, type ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { WorkspaceUnavailable } from "@/components/dashboard/workspace-unavailable";
import { AppUserSyncError, ensureAppUser } from "@/lib/auth/ensure-app-user";

async function ProtectedDashboard({ children }: { children: ReactNode }) {
  try {
    await ensureAppUser();
  } catch (error: unknown) {
    // Auth redirects still propagate; only identity-sync failures use this UI.
    if (!(error instanceof AppUserSyncError)) throw error;
    return (
      <DashboardShell>
        <WorkspaceUnavailable />
      </DashboardShell>
    );
  }
  return <DashboardShell>{children}</DashboardShell>;
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
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
      <ProtectedDashboard>{children}</ProtectedDashboard>
    </Suspense>
  );
}
