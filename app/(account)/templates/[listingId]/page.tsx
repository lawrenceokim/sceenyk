import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { getOwnedMarketplaceListing } from "@/lib/marketplace/server";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
import { TemplateDetail } from "@/components/marketplace/template-detail";
import { TemplateAccountBoundary } from "@/components/templates/template-account-boundary";
import { TemplateDetailSkeleton } from "@/components/marketplace/detail-skeletons";

export const metadata: Metadata = { title: "Your template — Sceenyk", robots: { index: false, follow: false } };

async function OwnedTemplate({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  const user = await ensureAppUser();
  let listing;
  try { listing = await getOwnedMarketplaceListing(listingId); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/templates" />; }
  if (!listing) notFound();
  return <TemplateAccountBoundary clerkUserId={user.clerk_user_id}><TemplateDetail listing={listing} owned /></TemplateAccountBoundary>;
}
export default function TemplatePage({ params }: { params: Promise<{ listingId: string }> }) {
  return <Suspense fallback={<TemplateDetailSkeleton owned />}><OwnedTemplate params={params} /></Suspense>;
}
