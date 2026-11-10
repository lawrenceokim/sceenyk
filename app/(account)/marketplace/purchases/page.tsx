import { PurchasesSkeleton } from "@/components/payments/financial-skeletons";
import { PurchasesWorkspace } from "@/components/marketplace/purchases-workspace";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { getMarketplacePurchases } from "@/lib/marketplace/payments/server";
import { FinancialPanel } from "@/components/marketplace/financial-panels";
import { getMarketplaceListing } from "@/lib/marketplace/server";
import { TemplateCover, MarketplaceFailure } from "@/components/marketplace/listing-card";
export const metadata = { title: "My Marketplace purchases — Sceenyk", robots: { index: false, follow: false } };
async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await getMarketplacePurchases(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/marketplace/purchases" />; }
  // Enrich only with public previews. Unpublished/unavailable listings keep a placeholder.
  const previews = await Promise.all([...new Set(result.items.map(purchase => purchase.listingId))].map(async id => {
    try {
      const listing = await getMarketplaceListing(id);
      return listing ? [id, <TemplateCover key={id} template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} previewUrl={listing.previewUrl} />] as const : null;
    } catch (error) { unstable_rethrow(error); return null; }
  }));
  const purchasePreviews = Object.fromEntries(previews.filter(entry => entry !== null));
  return <FinancialPanel clerkUserId={result.clerkUserId} page={current} purchases={result} purchasePreviews={purchasePreviews} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <PurchasesWorkspace><Suspense fallback={<PurchasesSkeleton />}><Content searchParams={searchParams} /></Suspense></PurchasesWorkspace>;
}
