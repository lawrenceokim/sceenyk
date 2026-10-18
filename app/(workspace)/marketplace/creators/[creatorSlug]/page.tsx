import { Suspense } from "react";
import Link from "next/link";
import { notFound, unstable_rethrow } from "next/navigation";
import { getCreatorStorefront } from "@/lib/marketplace/creators/server";
import { CreatorStorefront } from "@/components/marketplace/creator-storefront";
import { MarketplaceFailure, MarketplaceLoading } from "@/components/marketplace/listing-card";

export const metadata = { title: "Creator storefront — Sceenyk Marketplace" };
type Props = { params: Promise<{ creatorSlug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
async function Storefront({ params, searchParams }: Props) {
  const { creatorSlug } = await params, { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let data;
  try { data = await getCreatorStorefront(creatorSlug, current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href={`/marketplace/creators/${encodeURIComponent(creatorSlug)}`} />; }
  if (!data) notFound();
  return <CreatorStorefront data={data} />;
}
export default function Page(props: Props) {
  return <div className="space-y-6"><Link href="/marketplace" className="nav-link inline-flex min-h-11 items-center text-link">Back to Marketplace</Link><Suspense fallback={<MarketplaceLoading />}><Storefront {...props} /></Suspense></div>;
}
