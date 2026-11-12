import { Suspense } from "react";
import { EarningsPageClient } from "@/components/cache/account-pages";
import { EarningsSkeleton } from "@/components/payments/financial-skeletons";
export const metadata = { title: "Creator earnings — Sceenyk", robots: { index: false, follow: false } };
export default function Page() { return <Suspense fallback={<EarningsSkeleton />}><EarningsPageClient /></Suspense>; }
