import { Suspense } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { getCreatorEarnings } from "@/lib/marketplace/payments/server";
import { FinancialPanel } from "@/components/marketplace/financial-panels";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
export const metadata = { title: "Creator earnings — Sceenyk", robots: { index: false, follow: false } };
async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result;
  try { result = await getCreatorEarnings(current); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/dashboard/marketplace/earnings" />; }
  return <FinancialPanel clerkUserId={result.clerkUserId} page={current} earnings={result.earnings} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <><header className="space-y-3"><p className="eyebrow">MARKETPLACE · SANDBOX</p><h1 className="text-3xl font-bold tracking-tight">Creator earnings</h1></header><nav className="flex flex-wrap gap-4 text-body-sm"><Link className="nav-link text-link" href="/dashboard/marketplace">My Marketplace Listings</Link><Link className="nav-link text-link" href="/dashboard/marketplace/purchases">My Marketplace purchases</Link></nav><Suspense fallback={<p role="status">Loading your Marketplace account…</p>}><Content searchParams={searchParams} /></Suspense></>;
}
