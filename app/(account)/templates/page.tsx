import { TemplatesHeading } from "@/components/templates/templates-heading";
import { Suspense } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { listOwnedMarketplaceListings } from "@/lib/marketplace/server";
import { OwnedListings } from "@/components/marketplace/owned-listings";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
import { GallerySkeleton } from "@/components/marketplace/gallery-skeletons";

export const metadata: Metadata = { title: "Templates — Sceenyk", robots: { index: false, follow: false } };

async function Templates({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const user = await ensureAppUser();
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await listOwnedMarketplaceListings(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/templates" />; }
  return <OwnedListings clerkUserId={user.clerk_user_id} result={result} presentation="library" />;
}

export default function TemplatesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  return (
    <div className={`
      workspace-templates
      [.workspace-content_.workspace-page[data-workspace-page='content'][data-workspace-view='templates']_>_&&]:mt-[0]
      [&&_>_#templates]:mt-[40px] max-599:[&&_>_#templates]:mt-[24px]
    `}>
      <TemplatesHeading />
      <Suspense fallback={<GallerySkeleton variant="library" />}><Templates searchParams={searchParams} /></Suspense>

    </div>
  );
}
