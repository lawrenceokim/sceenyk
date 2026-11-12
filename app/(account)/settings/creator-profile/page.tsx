import { Suspense } from "react";
import { CreatorProfileSection } from "@/components/settings/settings-content-shells";
import { CreatorProfileSkeleton } from "@/components/settings/settings-skeletons";
import { ProfileSettingsClient } from "@/components/cache/account-pages";
export const metadata = { title: "Public creator profile — Sceenyk", robots: { index: false, follow: false } };
export default function Page() { return <CreatorProfileSection><Suspense fallback={<CreatorProfileSkeleton />}><ProfileSettingsClient /></Suspense></CreatorProfileSection>; }
