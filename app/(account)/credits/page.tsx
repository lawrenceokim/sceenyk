import { Suspense } from "react";
import type { Metadata } from "next";
import { CreditsPageClient } from "@/components/cache/account-pages";
import { CreditAccountSkeleton } from "@/components/payments/financial-skeletons";
export const metadata: Metadata = { title: "Credits & Billing — Sceenyk" };
export default function CreditsPage() {
  return <div className="grid min-w-0 gap-5"><Suspense fallback={<CreditAccountSkeleton dashboard />}><CreditsPageClient /></Suspense></div>;
}
