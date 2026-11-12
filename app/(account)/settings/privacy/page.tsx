import { PrivacySettingsSection } from "@/components/settings/settings-content-shells";
import { AccountSettingsSkeleton } from "@/components/settings/settings-skeletons";
import { Suspense } from "react";
import { AccountSettingsClient } from "@/components/cache/account-pages";
export default function Page() {
  return <PrivacySettingsSection><Suspense fallback={<AccountSettingsSkeleton security />}><AccountSettingsClient security /></Suspense></PrivacySettingsSection>;
}
