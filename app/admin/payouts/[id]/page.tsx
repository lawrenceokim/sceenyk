import { PayoutSupportSkeleton } from "@/components/payout-support/support-skeletons";
import { Suspense } from "react";
import { getPayoutSupportDetail } from "@/lib/payout-support/server";
import { readSupportPage, supportPageNumber } from "@/lib/payout-support/page-read";
import { PayoutDetailView, SupportUnavailable } from "@/components/payout-support/views";
export const metadata = { title: "Withdrawal support — Sceenyk" };
async function Content({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const input = { id, historyPage: supportPageNumber(query.historyPage), auditPage: supportPageNumber(query.auditPage), allocationPage: supportPageNumber(query.allocationPage) };
  const result = await readSupportPage(() => getPayoutSupportDetail(input));
  if (!result.ok) return <SupportUnavailable />;
  return <PayoutDetailView data={result.data} {...input} />;
}
export default function Page(props: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<PayoutSupportSkeleton detail />}><Content {...props} /></Suspense>;
}
