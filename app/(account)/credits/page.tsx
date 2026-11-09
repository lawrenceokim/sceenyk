import { Suspense } from "react";
import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { sandboxCreditPacks } from "@/lib/payments/packs";
import { isPayPalConfigured } from "@/lib/payments/paypal/config";
import { CreditPurchases } from "@/components/payments/credit-purchases";
import { CreditAccountSkeleton } from "@/components/payments/financial-skeletons";

export const metadata: Metadata = { title: "Credits & Billing — Sceenyk Sandbox" };

async function CreditAccount() {
  const user = await ensureAppUser();
  return <CreditPurchases dashboard clerkUserId={user.clerk_user_id} packs={[...sandboxCreditPacks]} configured={isPayPalConfigured()} />;
}

export default function CreditsPage() {
  return <div className="grid min-w-0 gap-5">
    <div className="flex w-fit items-start gap-2 rounded-xl bg-primary/[0.06] px-3 py-1.5 text-xs leading-[18px] text-foreground" role="note">
      <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
      <span>This is a PayPal Sandbox testing environment. No real money is charged. These temporary hackathon packs are not production pricing.</span>
    </div>
    <Suspense fallback={<CreditAccountSkeleton dashboard />}><CreditAccount /></Suspense>
  </div>;
}
