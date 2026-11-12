import { Suspense } from "react";
import { CreationPreferencesSection } from "@/components/settings/settings-content-shells";
import { CreationPreferencesSkeleton } from "@/components/settings/settings-skeletons";
import { CreationSettingsClient } from "@/components/cache/account-pages";
export default function Page() { return <CreationPreferencesSection><Suspense fallback={<CreationPreferencesSkeleton />}><CreationSettingsClient /></Suspense></CreationPreferencesSection>; }
