import { Suspense } from "react";
import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { getAcquiredTemplates } from "@/lib/marketplace/purchases/server";
import { PurchasesLibrary } from "@/components/purchases/purchases-library";
import { PurchasesBoundary } from "@/components/purchases/purchases-boundary";
import {
  PurchasesHeading,
  PurchasesGridSkeleton,
  PurchasesFailure,
} from "@/components/purchases/purchases-states";

export const metadata: Metadata = {
  title: "Purchases — Sceenyk",
  robots: { index: false, follow: false },
};
type Props = { searchParams: Promise<{ page?: string | string[] }> };

async function OwnedPurchases({ searchParams }: Props) {
  const { page } = await searchParams;
  const current =
    typeof page === "string" && /^\d{1,6}$/.test(page)
      ? Math.max(1, Math.min(100000, Number(page)))
      : 1;
  let result;
  try {
    result = await getAcquiredTemplates(current);
  } catch (error) {
    unstable_rethrow(error);
    return <PurchasesFailure />;
  }
  return (
    <PurchasesBoundary
      clerkUserId={result.clerkUserId}
      fallback={<PurchasesGridSkeleton />}
    >
      <PurchasesLibrary result={result} />
    </PurchasesBoundary>
  );
}
export default function PurchasesPage(props: Props) {
  return (
    <div className="min-w-0 space-y-8">
      <PurchasesHeading />
      <Suspense fallback={<PurchasesGridSkeleton />}>
        <OwnedPurchases {...props} />
      </Suspense>
    </div>
  );
}
