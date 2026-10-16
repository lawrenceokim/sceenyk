import type { ReactNode } from "react";
import { SettingsNavigation } from "@/components/settings/settings-navigation";

export const metadata = { title: "Settings — Sceenyk", robots: { index: false, follow: false } };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <div className="space-y-7"><header className="space-y-2"><p className="eyebrow">YOUR WORKSPACE</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Settings</h1><p className="text-muted-foreground">Make Sceenyk feel like your creative home.</p></header>
    <div className="grid min-w-0 items-start gap-7 xl:grid-cols-[13rem_minmax(0,1fr)]"><SettingsNavigation /><div className="min-w-0">{children}</div></div>
  </div>;
}
