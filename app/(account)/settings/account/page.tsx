import { AccountSettingsSkeleton } from "@/components/settings/settings-skeletons";
import { Suspense } from "react";
import { SettingsSection } from "@/components/settings/settings-section";
import { AccountSettingsClient } from "@/components/cache/account-pages";
export default function Page() {
  return <SettingsSection title="Account" description="Your private identity and sign-in account."><Suspense fallback={<AccountSettingsSkeleton />}><AccountSettingsClient /></Suspense></SettingsSection>;
}
