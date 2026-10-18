import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";

export const metadata: Metadata = { title: "Templates — Sceenyk", robots: { index: false, follow: false } };

async function Templates({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await ensureAppUser();
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await listOwnedMarketplaceListings(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/dashboard/templates" />; }
  return <OwnedListings clerkUserId={user.clerk_user_id} result={result} presentation="library" />;
}

export default function TemplatesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return (
    <div className="workspace-templates">
      <header className="marketplace-heading"><h1>My Templates</h1><p>Templates you&apos;ve published. Open one to manage or continue your work.</p></header>
      <Suspense fallback={<p role="status" className="py-8 text-muted-foreground">Opening your templates…</p>}><Templates searchParams={searchParams} /></Suspense>
      <footer className="template-library-footer">
        <nav aria-label="Template library links"><Link href="/dashboard/marketplace/new">Publish from a project</Link><Link href="/dashboard/marketplace">Manage listings</Link><Link href="/dashboard/marketplace/purchases">Marketplace purchases</Link></nav>
        <p>Adopted templates live in <Link href="/dashboard/projects">Projects</Link>.</p>
      </footer>
    </div>
  );
}
