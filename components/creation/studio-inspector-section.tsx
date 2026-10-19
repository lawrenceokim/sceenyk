import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function StudioInspectorSection({ title, open = false, children }: {
  title: string; open?: boolean; children: ReactNode;
}) {
  return <details className={`
      studio-inspector [&&]:[border-bottom:1px_solid_var(--border)] [&&_summary]:flex
      [&&_summary]:min-h-[var(--workspace-property-row-height)] [&&_summary]:items-center [&&_summary]:justify-between
      [&&_summary]:gap-[var(--ui-space-2)] [&&_summary]:text-[length:var(--ui-text-panel)] [&&_summary]:font-[600]
      [&&_summary]:cursor-pointer [&&_summary]:[list-style:none] [&&_summary::-webkit-details-marker]:hidden
      [&&_summary:focus-visible]:[outline:2px_solid_var(--ring)] [&&_summary:focus-visible]:[outline-offset:2px]
      [&&_summary:focus-visible]:rounded-[4px] [&&_summary_svg]:text-[color:var(--muted-foreground)]
      [&&[open]_>_summary_svg]:[transform:rotate(180deg)]
    `} open={open}>
    <summary>{title}<ChevronDown className="size-3.5" aria-hidden="true" /></summary>
    <div className={`
      studio-inspector-content [&&]:pb-[var(--ui-space-4)] [&&_>_fieldset_>_legend]:absolute [&&_>_fieldset_>_legend]:w-[1px]
      [&&_>_fieldset_>_legend]:h-[1px] [&&_>_fieldset_>_legend]:overflow-hidden
      [&&_>_fieldset_>_legend]:[clip-path:inset(50%)] [&&_.grid-cols-2_label_>_span]:min-h-[40px]
      [&&_.grid-cols-2_label_>_span]:pt-[8px] [&&_.grid-cols-2_label_>_span]:pr-[8px] [&&_.grid-cols-2_label_>_span]:pb-[8px]
      [&&_.grid-cols-2_label_>_span]:pl-[8px] [&&_.grid-cols-2_label_>_span]:flex-row
      [&&_.grid-cols-2_label_>_span]:items-center [&&_.grid-cols-2_label_>_span]:gap-[6px]
      [&&_.grid-cols-2_label_>_span_>_span:first-child]:mt-[0] [&&_.grid-cols-2_label_>_span_>_span:first-child]:mr-[0]
      [&&_.grid-cols-2_label_>_span_>_span:first-child]:mb-[0] [&&_.grid-cols-2_label_>_span_>_span:first-child]:ml-[0]
      [&&_.grid-cols-2_label_svg]:w-[14px] [&&_.grid-cols-2_label_svg]:h-[14px] [&&_.grid-cols-2_label_svg_+_svg]:hidden
      [&&_.grid-cols-2]:[grid-template-columns:minmax(0,1fr)] [&&_.grid-cols-2]:gap-[4px]
    `}>{children}</div>
  </details>;
}
