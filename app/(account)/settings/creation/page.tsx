import { CreationPreferencesSection } from "@/components/settings/settings-content-shells";
import { CreationPreferencesSkeleton } from "@/components/settings/settings-skeletons";
import { Suspense } from "react";
import { unstable_rethrow } from "next/navigation";
import { CreationPreferencesForm } from "@/components/settings/creation-preferences";
import { getCreationPreferences } from "@/lib/settings/server";
async function Content() {
  let result;
  try { result = await getCreationPreferences(); }
  catch (error) { unstable_rethrow(error); return <p role="alert" className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card p-6 [.marketplace-configuration_>_&&]:[border:0]
      [.marketplace-configuration_>_&&]:rounded-[0] [.marketplace-configuration_>_&&]:[background:transparent]
      [.marketplace-configuration_>_&&]:pt-[16px] [.marketplace-configuration_>_&&]:pr-[0]
      [.marketplace-configuration_>_&&]:pb-[0] [.marketplace-configuration_>_&&]:pl-[0]
      [[data-workspace-shell]_&&]:[box-shadow:none] [.workspace-settings-inner_label&&]:min-h-[0]
      [.workspace-settings-inner_label&&]:gap-[8px] [.workspace-settings-inner_label&&]:pt-[12px]
      [.workspace-settings-inner_label&&]:pr-[12px] [.workspace-settings-inner_label&&]:pb-[12px]
      [.workspace-settings-inner_label&&]:pl-[12px] [.workspace-settings-inner_label&&_svg]:w-[18px]
      [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}>Creation defaults are temporarily unavailable. Reopen this section to try again. Existing projects are unaffected.</p>; }
  return <CreationPreferencesForm {...result} />;
}
export default function Page() {
  return <CreationPreferencesSection><Suspense fallback={<CreationPreferencesSkeleton />}><Content /></Suspense></CreationPreferencesSection>;
}
