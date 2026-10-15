import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getOwnedCreatorProfile } from "@/lib/marketplace/creators/server";
import { CreatorProfileEditor } from "@/components/marketplace/creator-profile-editor";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";

export const metadata = { title: "Public creator profile — Sceenyk", robots: { index: false, follow: false } };
async function Content() {
  let result;
  try { result = await getOwnedCreatorProfile(); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/dashboard/marketplace/profile" />; }
  return <CreatorProfileEditor {...result} />;
}
export default function Page() {
  return <><header className="space-y-3"><p className="eyebrow">YOUR CREATOR SPACE</p><h1 className="text-3xl font-bold tracking-tight">Your public creator profile</h1></header><Link href="/dashboard/marketplace" className="nav-link text-link">My Marketplace Listings</Link><Suspense fallback={<p role="status">Loading your profile…</p>}><Content /></Suspense></>;
}
