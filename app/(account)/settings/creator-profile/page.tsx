import { CreatorProfileSection } from "@/components/settings/settings-content-shells";
import { CreatorProfileSkeleton } from "@/components/settings/settings-skeletons";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { getOwnedCreatorProfile } from "@/lib/marketplace/creators/server";
import { CreatorProfileEditor } from "@/components/marketplace/creator-profile-editor";
import { MarketplaceFailure } from "@/components/marketplace/listing-card";

export const metadata = { title: "Public creator profile — Sceenyk", robots: { index: false, follow: false } };
async function Content() {
  let result;
  try { result = await getOwnedCreatorProfile(); }
  catch (error) { unstable_rethrow(error); return <MarketplaceFailure href="/settings/creator-profile" />; }
  return <CreatorProfileEditor {...result} />;
}
export default function Page() {
  return <CreatorProfileSection><Suspense fallback={<CreatorProfileSkeleton />}><Content /></Suspense></CreatorProfileSection>;
}
