import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { SettingsSection, SettingsCard } from "@/components/settings/settings-section";
import { CreationPreferencesForm } from "@/components/settings/creation-preferences";
import { getCreationPreferences } from "@/lib/settings/server";
async function Content() {
  let result;
  try { result = await getCreationPreferences(); }
  catch (error) { unstable_rethrow(error); return <p role="alert" className="sceenyk-card p-6">Creation defaults are temporarily unavailable. Reopen this section to try again. Existing projects are unaffected.</p>; }
  return <CreationPreferencesForm {...result} />;
}
export default function Page() {
  return <SettingsSection title="Creation Preferences" description="Start new projects with your preferred defaults. Change them freely inside each project; saved and adopted projects keep their own settings."><Suspense fallback={<p role="status">Loading creation defaults…</p>}><Content /></Suspense><SettingsCard title="Captions and narration"><p>Caption visibility and style are currently configured per generation. Account defaults for captions and narration voice selection are future work; your existing generation controls remain available.</p></SettingsCard></SettingsSection>;
}
