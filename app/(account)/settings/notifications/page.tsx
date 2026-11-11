import { SettingsSection, SettingsCard } from "@/components/settings/settings-section";
export default function Page() {
  return <SettingsSection title="Notifications" description="Stay informed about the work and transactions that matter to you.">
    <SettingsCard title="In-app notifications"><p>Errors, warnings, validation and action results appear in the shared slide-in notification panel. You can dismiss a notice, and actionable notices keep their recovery controls available.</p><p>Check your project for generation progress, Credits & Billing for purchases, and Earnings & Payouts for withdrawal status.</p></SettingsCard>
    <SettingsCard title="Delivery preferences are planned"><p>Email, push and configurable generation-completed, generation-failed, low-credit, Marketplace sale and payout delivery are not available yet. There are no delivery preferences to save.</p></SettingsCard>
    <SettingsCard title="Essential account and financial messages"><p>Security messages handled by Clerk and required payment communications remain controlled by their services. Future notification preferences will not disable critical security or financial notices.</p></SettingsCard>
  </SettingsSection>;
}
