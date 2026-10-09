import type { ReactNode } from "react";

export function DashboardStatCard({
  icon,
  label,
  value,
  description,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="sceenyk-card min-w-0 p-5">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-body-sm font-medium text-muted-foreground">
          {label}
        </dt>
        <span aria-hidden="true" className="text-secondary-foreground">
          {icon}
        </span>
      </div>
      <dd className="mt-4 text-heading-2 font-semibold tracking-tight">
        {value}
      </dd>
      <dd className="mt-1 text-caption leading-relaxed text-muted-foreground">
        {description}
      </dd>
    </div>
  );
}
