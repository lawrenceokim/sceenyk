import { SettingsSection } from "@/components/settings/settings-section";
import type { Metadata } from "next";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { sandboxCreditPacks } from "@/lib/payments/packs";
import { isPayPalConfigured } from "@/lib/payments/paypal/config";
import { CreditPurchases } from "@/components/payments/credit-purchases";
import { FreeAllowanceSummary } from "@/components/free-allowance";

export const metadata: Metadata = { title: "Buy Credits — Sceenyk Sandbox" };
export const maxDuration = 120;

export default async function CreditsPage() {
  const user = await ensureAppUser();
  return <SettingsSection title="Credits & Billing" description="Buy credits. Create what you need. Top up when you need more.">
    <div className="space-y-3">
      <p className="eyebrow">SANDBOX CHECKOUT</p>

      <p className="max-w-2xl text-body text-muted-foreground">Test the credit purchase flow with a PayPal Sandbox buyer account. No real money is charged. These temporary hackathon packs are not production pricing.</p>
    </div>
    <CreditPurchases clerkUserId={user.clerk_user_id} packs={[...sandboxCreditPacks]} configured={isPayPalConfigured()} />
    <section className="sceenyk-card space-y-3 p-5 sm:p-6" aria-label="Free generation allowance">
      <h2 className="text-lg font-semibold">Your free allowance stays separate</h2>
      <FreeAllowanceSummary />
      <p className="text-caption text-muted-foreground">Purchases add paid credits for future generations. They do not reset free usage or change an existing generation reservation. Production generation rates are still awaiting approval.</p>
    </section>
  </SettingsSection>;
}
