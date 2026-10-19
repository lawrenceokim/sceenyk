import type { ReactNode } from "react";

export function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="workspace-settings-section min-w-0 space-y-6">
    <header className="space-y-2"><h1>{title}</h1><p className="max-w-2xl text-body-sm leading-relaxed text-muted-foreground">{description}</p></header>
    {children}
  </section>;
}

export function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="workspace-settings-card space-y-3"><h3>{title}</h3><div className="space-y-3 text-body-sm leading-relaxed text-muted-foreground">{children}</div></div>;
}
