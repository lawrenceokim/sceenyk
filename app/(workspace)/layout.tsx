import type { ReactNode } from "react";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { WorkspacePageFrame } from "@/components/workspace/workspace-page-frame";

// Presentation only: Studio/Marketplace stay public; owned project pages
// continue to enforce authentication and ownership themselves.
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <WorkspaceShell><WorkspacePageFrame>{children}</WorkspacePageFrame></WorkspaceShell>;
}
