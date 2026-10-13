import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { getOwnedMarketplaceListing } from "@/lib/marketplace/server";
import { ListingEditor } from "@/components/marketplace/listing-editor";
import { MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";

export const metadata: Metadata = { title: "Manage listing — Sceenyk", robots: { index: false, follow: false } };
async function OwnedListing({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const user = await ensureAppUser();
  let listing;
  try { listing = await getOwnedMarketplaceListing(listingId); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/dashboard/marketplace" />; }
  if (!listing) return <section className="sceenyk-card space-y-3 p-6"><h2 className="text-lg font-semibold">This listing is unavailable</h2><Link className="nav-link text-link" href="/dashboard/marketplace">My Marketplace Listings</Link></section>;
  return <ListingEditor clerkUserId={user.clerk_user_id} listing={listing} />;
}
export default function ManageListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  return <><header className="space-y-3"><p className="eyebrow">YOUR REUSABLE TEMPLATE</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Manage listing</h1><p className="text-muted-foreground">Edit its public metadata and control when it appears in Marketplace.</p></header><Suspense fallback={<MarketplaceLoading />}><OwnedListing params={params} /></Suspense></>;
}
