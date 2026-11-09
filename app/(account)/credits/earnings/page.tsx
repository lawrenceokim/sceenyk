import { EarningsSkeleton } from "@/components/payments/financial-skeletons";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { getCreatorEarnings } from "@/lib/marketplace/payments/server";
import { getWithdrawalAccount } from "@/lib/marketplace/withdrawals/server";
import { FinancialPanel } from "@/components/marketplace/financial-panels";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";
export const metadata = { title: "Creator earnings — Sceenyk", robots: { index: false, follow: false } };
async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { page } = await searchParams;
  const current = typeof page === "string" && /^\d{1,6}$/.test(page) ? Math.max(1, Math.min(100000, Number(page))) : 1;
  let result, withdrawals;
  try { [result, withdrawals] = await Promise.all([getCreatorEarnings(current), getWithdrawalAccount(current)]); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/credits/earnings" />; }
  return <FinancialPanel clerkUserId={result.clerkUserId} page={current} earnings={result.earnings} withdrawals={withdrawals.account} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<EarningsSkeleton />}><Content searchParams={searchParams} /></Suspense>;
}
