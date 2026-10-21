import { PayoutSupportSkeleton } from "@/components/payout-support/support-skeletons";
import { Suspense } from "react";
import { getPayoutSupportQueue } from "@/lib/payout-support/server";
import { readSupportPage, supportPageNumber } from "@/lib/payout-support/page-read";
import { PayoutQueueView, SupportUnavailable } from "@/components/payout-support/views";
export const metadata = { title: "Payout support — Sceenyk" };
async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const input = { query: params.query ?? "", status: params.status ?? "all", page: supportPageNumber(params.page) };
  const result = await readSupportPage(() => getPayoutSupportQueue(input));
  if (!result.ok) return <SupportUnavailable />;
  return <PayoutQueueView data={result.data} query={result.data.filters.query} status={result.data.filters.status} />;
}
export default function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<PayoutSupportSkeleton />}><Content searchParams={searchParams} /></Suspense>;
}
