import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { requireAdminOrSupport } from "@/lib/auth/require-admin-or-support";
import { readSupportPage } from "@/lib/payout-support/page-read";
import { SupportUnavailable } from "@/components/payout-support/views";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import { WorkspacePageFrame } from "@/components/workspace/workspace-page-frame";

export const metadata = { robots: { index: false, follow: false } };
async function ProtectedInternal({ children }: { children: ReactNode }) {
  const authorized = await readSupportPage(requireAdminOrSupport);
  return <WorkspaceShell><WorkspacePageFrame>
    <nav aria-label="Internal navigation" className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-5 text-body-sm">
      <Link prefetch={false} href="/admin/payouts" className="nav-link text-link">Payout support</Link>
      <Link className="nav-link text-muted-foreground" href="/settings/appearance">Appearance</Link>
      <Link className="nav-link text-muted-foreground" href="/studio">Return to Studio</Link>
    </nav>
    {authorized.ok ? children : <SupportUnavailable />}
  </WorkspacePageFrame></WorkspaceShell>;
}
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status" className="sceenyk-container py-10 text-muted-foreground">Opening internal workspace…</p>}><ProtectedInternal>{children}</ProtectedInternal></Suspense>;
}
