import { Suspense } from "react";
import type { Metadata } from "next";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { sandboxCreditPacks } from "@/lib/payments/packs";
import { isPayPalConfigured } from "@/lib/payments/paypal/config";
import { CreditPurchases } from "@/components/payments/credit-purchases";
import { FreeAllowanceSummary } from "@/components/free-allowance";
import { CreditAccountSkeleton } from "@/components/payments/financial-skeletons";

export const metadata: Metadata = { title: "Credits & Billing — Sceenyk Sandbox" };

async function CreditAccount() {
  const user = await ensureAppUser();
  return <>
    <CreditPurchases clerkUserId={user.clerk_user_id} packs={[...sandboxCreditPacks]} configured={isPayPalConfigured()} />
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-3 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} aria-label="Free generation allowance">
      <h2 className="text-lg font-semibold">Your free allowance stays separate</h2>
      <FreeAllowanceSummary />
      <p className="text-caption text-muted-foreground">Purchases add paid credits for future generations. They do not reset free usage or change an existing generation reservation. Production generation rates are still awaiting approval.</p>
    </section>
  </>;
}

export default function CreditsPage() {
  return <div className="space-y-6">
    <div className="space-y-3">
      <p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>SANDBOX CHECKOUT</p>

      <p className="max-w-2xl text-body text-muted-foreground">Test the credit purchase flow with a PayPal Sandbox buyer account. No real money is charged. These temporary hackathon packs are not production pricing.</p>
    </div>
    <Suspense fallback={<CreditAccountSkeleton />}><CreditAccount /></Suspense>
  </div>;
}
