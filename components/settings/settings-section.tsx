import type { ReactNode } from "react";

export function SettingsSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className={"workspace-settings-section min-w-0 space-y-6 [.workspace-settings-inner_&&_>_*_+_*]:mt-[20px] [.workspace-settings-inner_&&_>_header:first-child]:mb-[24px] [.workspace-settings-inner_>_&&_>_header_h2]:text-[length:20px] [.workspace-settings-inner_>_&&_>_header_h2]:leading-[28px] [.workspace-settings-inner_>_&&_>_header_h2]:font-[600] [.workspace-settings-inner_>_&&_>_header_h2]:tracking-[-.025em] [.workspace-settings-inner_.manage-templates-page_&&_>_*_+_*]:mt-[16px] [.workspace-settings-inner_.manage-templates-page_&&_>_header:first-child]:mb-[0]"}>
    <header className="space-y-2"><h2>{title}</h2><p className="max-w-2xl text-body-sm leading-relaxed text-muted-foreground">{description}</p></header>
    {children}
  </section>;
}

export function SettingsCard({ title, children }: { title: string; children: ReactNode }) {
  return <div className={"workspace-settings-card space-y-3 [&&_>_h3]:mb-[8px]"}><h3>{title}</h3><div className="space-y-3 text-body-sm leading-relaxed text-muted-foreground">{children}</div></div>;
}
