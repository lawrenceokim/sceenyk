import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound, unstable_rethrow } from "next/navigation";
import { getAcquiredTemplate } from "@/lib/marketplace/purchases/server";
import { PurchaseDetail } from "@/components/purchases/purchase-detail";
import { PurchasesBoundary } from "@/components/purchases/purchases-boundary";
import { PurchaseDetailSkeleton, PurchasesFailure } from "@/components/purchases/purchases-states";

export const metadata: Metadata = { title: "Purchased template — Sceenyk", robots: { index: false, follow: false } };
type Props = { params: Promise<{ id: string }> };
async function OwnedPurchase({ params }: Props) {
  let result;
  try { result = await getAcquiredTemplate((await params).id); }
  catch (error) { unstable_rethrow(error); return <PurchasesFailure detail />; }
  if (!result) notFound();
  return <PurchasesBoundary clerkUserId={result.clerkUserId} fallback={<PurchaseDetailSkeleton />}><PurchaseDetail purchase={result.purchase} /></PurchasesBoundary>;
}
export default function PurchasePage(props: Props) {
  return <Suspense fallback={<PurchaseDetailSkeleton />}><OwnedPurchase {...props} /></Suspense>;
}
