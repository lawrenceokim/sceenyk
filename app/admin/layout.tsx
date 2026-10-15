import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { requireAdminOrSupport } from "@/lib/auth/require-admin-or-support";
import { readSupportPage } from "@/lib/payout-support/page-read";
import { SupportUnavailable } from "@/components/payout-support/views";
import { SceenykLogo } from "@/components/brand/sceenyk-logo";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata = { robots: { index: false, follow: false } };
async function ProtectedInternal({ children }: { children: ReactNode }) {
  const authorized = await readSupportPage(requireAdminOrSupport);
  if (!authorized.ok) return <SupportUnavailable />;
  return <div className="min-h-dvh"><header className="border-b border-border bg-background"><nav aria-label="Internal navigation" className="sceenyk-container flex items-center justify-between gap-4 py-4"><Link prefetch={false} href="/admin/payouts" aria-label="Sceenyk payout support"><SceenykLogo /></Link><div className="flex items-center gap-3"><Link className="nav-link inline-flex min-h-11 items-center text-body-sm text-link" href="/dashboard">Dashboard</Link><ThemeToggle /></div></nav></header><main className="sceenyk-container min-w-0 py-8">{children}</main></div>;
}
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<p role="status" className="sceenyk-container py-10 text-muted-foreground">Opening internal workspace…</p>}><ProtectedInternal>{children}</ProtectedInternal></Suspense>;
}
