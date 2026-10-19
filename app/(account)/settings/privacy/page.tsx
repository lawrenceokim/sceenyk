import { Suspense } from "react";
import { SettingsSection, SettingsCard } from "@/components/settings/settings-section";
import { AccountSettings } from "@/components/settings/account-settings";
import { prepareSettingsAccount } from "@/lib/settings/account";
async function Content() { return <AccountSettings {...await prepareSettingsAccount()} security />; }
export default function Page() {
  return <SettingsSection title="Privacy & Security" description="Understand what you share and keep your account secure.">
    <SettingsCard title="Your public creator presence"><p>Your reviewed creator display name, stable slug, public avatar and bio appear on your Marketplace storefront, together with published templates and public activity counts.</p></SettingsCard>
    <SettingsCard title="Your private workspace"><p>Your account email, private projects and source media, AI-credit balance, purchases, earnings, payout destination and withdrawal history stay private. Publishing a template does not publish its original project or private source media.</p></SettingsCard>
    <Suspense fallback={<p role="status">Loading security controls…</p>}><Content /></Suspense>
  </SettingsSection>;
}
