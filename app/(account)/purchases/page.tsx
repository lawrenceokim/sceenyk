import { Suspense } from "react";
import type { Metadata } from "next";
import { PurchasesGalleryClient } from "@/components/purchases/purchases-gallery-client";
import {
  PurchasesHeading,
  PurchasesGridSkeleton,
} from "@/components/purchases/purchases-states";

export const metadata: Metadata = {
  title: "Purchases — Sceenyk",
  robots: { index: false, follow: false },
};
export default function PurchasesPage() {
  return (
    <div className="min-w-0 space-y-8">
      <PurchasesHeading />
      <Suspense fallback={<PurchasesGridSkeleton />}>
        <PurchasesGalleryClient />
      </Suspense>
    </div>
  );
}
