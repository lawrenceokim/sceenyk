import { WorkspacePageHeader } from "@/components/workspace/workspace-page-header";
import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getMarketplacePurchases } from "@/lib/marketplace/payments/server";
import { FinancialPanel } from "@/components/marketplace/financial-panels";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
export const metadata = { title: "My Marketplace purchases — Sceenyk", robots: { index: false, follow: false } };
async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await getMarketplacePurchases(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/marketplace/purchases" />; }
  return <FinancialPanel clerkUserId={result.clerkUserId} page={current} purchases={result} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><WorkspacePageHeader title="My Marketplace purchases" eyebrow="MARKETPLACE · SANDBOX" description="Review your existing purchases and recover an adopted project."></WorkspacePageHeader><nav className="flex flex-wrap gap-4 text-body-sm"><Link className="nav-link text-link" href="/settings/templates">My Marketplace Listings</Link><Link className="nav-link text-link" href="/settings/earnings">Creator earnings</Link></nav><Suspense fallback={<p role="status">Loading your Marketplace account…</p>}><Content searchParams={searchParams} /></Suspense></>;
}
