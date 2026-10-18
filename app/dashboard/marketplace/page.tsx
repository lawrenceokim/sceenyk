import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";
import { MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { Button } from "@/components/ui/button";


export const metadata: Metadata = { title: "My Marketplace Listings — Sceenyk", robots: { index: false, follow: false } };
async function Listings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await ensureAppUser();
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await listOwnedMarketplaceListings(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/dashboard/marketplace" />; }
  return <OwnedListings clerkUserId={user.clerk_user_id} result={result} />;
}
export default function MyListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><WorkspacePageHeader title="My Marketplace Listings" eyebrow="YOUR CREATOR SPACE" description="Manage your drafts, published templates and unpublished listings."><Button nativeButton={false} render={<Link href="/dashboard/marketplace/new" />}>Publish a template</Button></WorkspacePageHeader><nav className="flex flex-wrap gap-4 text-body-sm"><Link className="nav-link text-link" href="/dashboard/settings/creator-profile">Public creator profile</Link><Link className="nav-link text-link" href="/dashboard/settings/earnings">Creator earnings</Link><Link className="nav-link text-link" href="/dashboard/marketplace/purchases">My Marketplace purchases</Link></nav><Suspense fallback={<MarketplaceLoading />}><Listings searchParams={searchParams} /></Suspense></>;
}
