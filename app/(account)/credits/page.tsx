import { Suspense } from "react";
import type { Metadata } from "next";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { getCreditPurchasePricing } from "@/lib/payments/credit-pricing-config";
import { isPayPalConfigured } from "@/lib/payments/paypal/config";
import { CreditPurchases } from "@/components/payments/credit-purchases";
import { CreditAccountSkeleton } from "@/components/payments/financial-skeletons";

export const metadata: Metadata = { title: "Credits & Billing — Sceenyk Sandbox" };

async function CreditAccount() {
  const user = await ensureAppUser();
  return <CreditPurchases dashboard clerkUserId={user.clerk_user_id} pricing={getCreditPurchasePricing()} configured={isPayPalConfigured()} />;
}

export default function CreditsPage() {
  return <div className="grid min-w-0 gap-5">
    <Suspense fallback={<CreditAccountSkeleton dashboard />}><CreditAccount /></Suspense>
  </div>;
}
