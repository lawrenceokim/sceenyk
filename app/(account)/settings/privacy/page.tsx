import { PrivacySettingsSection } from "@/components/settings/settings-content-shells";
import { AccountSettingsSkeleton } from "@/components/settings/settings-skeletons";
import { Suspense } from "react";
import { AccountSettings } from "@/components/settings/account-settings";
import { prepareSettingsAccount } from "@/lib/settings/account";
async function Content() { return <AccountSettings {...await prepareSettingsAccount()} security />; }
export default function Page() {
  return <PrivacySettingsSection><Suspense fallback={<AccountSettingsSkeleton security />}><Content /></Suspense></PrivacySettingsSection>;
}
