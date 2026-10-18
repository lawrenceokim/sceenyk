import Link from "next/link";
import { SettingsSection, SettingsCard } from "@/components/settings/settings-section";
export default function Page() {
  return <SettingsSection title="Data & Account" description="Your projects, records and future account-data options.">
    <SettingsCard title="Your saved work"><p>Manage your private drafts from your workspace and your published templates from Marketplace management.</p><div className="flex flex-wrap gap-4"><Link className="nav-link text-link" href="/dashboard/projects">My projects</Link><Link className="nav-link text-link" href="/dashboard/marketplace">My Marketplace listings</Link></div></SettingsCard>
    <SettingsCard title="Account data export"><p>A complete account-data export is not available yet. Purchase and withdrawal histories remain available in their Settings sections.</p></SettingsCard>
    <SettingsCard title="Danger Zone"><p>Account deletion is unavailable until a complete policy covers projects, Marketplace listings, ownership, creator earnings, pending payouts and required financial records. Settings does not offer a destructive action. Clerk self-service deletion is disabled before opening its account controls.</p></SettingsCard>
  </SettingsSection>;
}
