import type { ReactNode } from "react";

export function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="min-w-0 space-y-6">
    <header className="space-y-2"><h2 className="text-2xl font-semibold tracking-tight">{title}</h2><p className="max-w-2xl text-body-sm leading-relaxed text-muted-foreground">{description}</p></header>
    {children}
  </section>;
}

export function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className="sceenyk-card min-w-0 space-y-3 p-5 sm:p-6"><h3 className="text-lg font-semibold">{title}</h3><div className="space-y-3 text-body-sm leading-relaxed text-muted-foreground">{children}</div></div>;
}
