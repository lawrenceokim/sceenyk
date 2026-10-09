import type { ReactNode } from "react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

// Public UI preview until Clerk development authentication is connected.
// Introduce verified session protection before this shell displays private data.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
