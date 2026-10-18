import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function StudioInspectorSection({ title, open = false, children }: {
  title: string; open?: boolean; children: ReactNode;
}) {
  return <details className="studio-inspector" open={open}>
    <summary>{title}<ChevronDown className="size-3.5" aria-hidden="true" /></summary>
    <div className="studio-inspector-content">{children}</div>
  </details>;
}
