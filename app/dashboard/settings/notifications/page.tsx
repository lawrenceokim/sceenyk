import { SettingsSection, SettingsCard } from "@/components/settings/settings-section";
export default function Page() {
  return <SettingsSection title="Notifications" description="Stay informed about the work and transactions that matter to you.">
    <SettingsCard title="Notification preferences are planned"><p>Sceenyk does not yet deliver configurable generation-completed, generation-failed, low-credit, Marketplace sale or payout notifications. There are no delivery preferences to save yet.</p><p>Check your project for generation progress, Credits & Billing for purchases, and Earnings & Payouts for withdrawal status.</p></SettingsCard>
    <SettingsCard title="Essential account and financial messages"><p>Security messages handled by Clerk and required payment communications remain controlled by their services. Future notification preferences will not disable critical security or financial notices.</p></SettingsCard>
  </SettingsSection>;
}
