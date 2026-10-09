import { Suspense, type ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { requireClerkUser } from "@/lib/auth/require-user";

async function ProtectedDashboard({ children }: { children: ReactNode }) {
  await requireClerkUser();
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
