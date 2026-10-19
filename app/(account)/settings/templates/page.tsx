import { SettingsSection } from "@/components/settings/settings-section";
import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";
import { MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { Button } from "@/components/ui/button";
import "@/components/marketplace/manage-templates.css";


export const metadata: Metadata = { title: "My Marketplace Listings — Sceenyk", robots: { index: false, follow: false } };
async function Listings({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await ensureAppUser();
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await listOwnedMarketplaceListings(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/settings/templates" />; }
  return <OwnedListings clerkUserId={user.clerk_user_id} result={result} />;
}
export default function MyListingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <div className="manage-templates-page"><SettingsSection title="Manage Templates" description="Manage your drafts, published templates and unpublished listings."><div><Button nativeButton={false} render={<Link href="/settings/templates/new" />}>Publish a template</Button></div><nav className="manage-templates-links flex flex-wrap gap-4 text-body-sm"><Link className="nav-link text-link" href="/settings/creator-profile">Public creator profile</Link><Link className="nav-link text-link" href="/settings/earnings">Creator earnings</Link><Link className="nav-link text-link" href="/marketplace/purchases">My Marketplace purchases</Link></nav><Suspense fallback={<MarketplaceLoading />}><Listings searchParams={searchParams} /></Suspense></SettingsSection></div>;
}
