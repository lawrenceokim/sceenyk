import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-5 py-10 text-center sm:px-8",
        className,
      )}
    >
      {icon && (
        <span
          aria-hidden="true"
          className="mb-5 flex size-14 items-center justify-center rounded-xl bg-accent text-accent-foreground"
        >
          {icon}
        </span>
      )}
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 max-w-sm text-body-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {(primaryAction || secondaryAction) && (
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}
