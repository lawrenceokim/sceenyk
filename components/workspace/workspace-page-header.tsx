import type { ReactNode } from "react";

export function WorkspacePageHeader({ title, description, eyebrow, children }: {
  title: string;
  description: string;
  eyebrow: string;
  children?: ReactNode;
}) {
  return (
    <header className={`
      workspace-page-heading flex min-w-0 flex-col justify-between gap-4 sm:flex-row sm:items-end
      [&&_>_div:first-child]:gap-[0] [&&_>_div:first-child_>_*_+_*]:mt-[12px] [&&_>_div:first-child_>_h1]:mt-[0]
    `}>
      <div className="max-w-2xl space-y-3">
        <p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>{eyebrow}</p>
        <h1 className="break-words text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        <p className="text-body leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children && <div className="flex shrink-0 flex-wrap gap-3">{children}</div>}
    </header>
  );
}
