import { Suspense } from "react";
import { PurchasesSkeleton } from "@/components/payments/financial-skeletons";
import { PurchasesWorkspace } from "@/components/marketplace/purchases-workspace";
import { HistoryPageClient } from "@/components/cache/account-pages";
export const metadata = { title: "My Marketplace purchases — Sceenyk", robots: { index: false, follow: false } };
export default function Page() { return <PurchasesWorkspace><Suspense fallback={<PurchasesSkeleton />}><HistoryPageClient /></Suspense></PurchasesWorkspace>; }
