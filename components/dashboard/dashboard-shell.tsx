import type { ReactNode } from "react";
import { DashboardHeader } from "./dashboard-header";
import { DashboardSidebar } from "./dashboard-sidebar";

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex-1">
      <a href="#dashboard-content" className="skip-link">
        Skip to content
      </a>
      <DashboardSidebar />
      <div className="min-w-0 lg:pl-60">
        <DashboardHeader />
        <main
          id="dashboard-content"
          tabIndex={-1}
          className="sceenyk-container space-y-8 py-8 outline-none md:space-y-10 md:py-10"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
