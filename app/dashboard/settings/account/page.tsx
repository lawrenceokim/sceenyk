import { Suspense } from "react";
import { SettingsSection } from "@/components/settings/settings-section";
import { AccountSettings } from "@/components/settings/account-settings";
import { prepareSettingsAccount } from "@/lib/settings/account";
async function Content() { return <AccountSettings {...await prepareSettingsAccount()} />; }
export default function Page() {
  return <SettingsSection title="Account" description="Your private identity and sign-in account."><Suspense fallback={<p role="status">Loading your account…</p>}><Content /></Suspense></SettingsSection>;
}
