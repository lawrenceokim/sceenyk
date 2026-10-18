import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { Button } from "@/components/ui/button";

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
    <div className="space-y-8">
      <WorkspacePageHeader title="Templates" eyebrow="YOUR CREATIVE LIBRARY" description="Reusable starting points from your Marketplace listings. Keep your ideas close, and make room for the next one.">
        <Button variant="outline" nativeButton={false} render={<Link href="/marketplace" />}>Explore Marketplace</Button>
      </WorkspacePageHeader>
      <nav aria-label="Template library links" className="workspace-library-links">
        <Link className="nav-link text-link" href="/dashboard/marketplace/new">Publish from a project</Link>
        <Link className="nav-link text-muted-foreground" href="/dashboard/marketplace">Manage listings</Link>
        <Link className="nav-link text-muted-foreground" href="/dashboard/marketplace/purchases">Marketplace purchases</Link>
      </nav>
      <Suspense fallback={<p role="status" className="py-8 text-muted-foreground">Opening your templates…</p>}><Templates searchParams={searchParams} /></Suspense>
      <p className="border-t border-border pt-5 text-body-sm leading-relaxed text-muted-foreground">Adopted templates become your own editable <Link href="/dashboard/projects" className="text-link underline underline-offset-4">Projects</Link>. These previews show template configurations; creator uploads and generated media are excluded.</p>
    </div>
  );
}
