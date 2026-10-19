import { templateAppearance, templatePattern } from "./template-appearance";

export function AbstractPreview({ previewId, fallbackColor, label = "Template preview", metadata, large = false, ariaLabel = "Abstract template placeholder; not generated media" }: {
  previewId?: string;
  fallbackColor?: string | null;
  label?: string;
  metadata?: string;
  large?: boolean;
  ariaLabel?: string;
}) {
  return <div className="workspace-template-cover template-placeholder" data-large={large} data-pattern={templatePattern(previewId ?? fallbackColor ?? "template")} style={templateAppearance({ id: previewId, fallbackColor })} aria-label={ariaLabel}>
    <span className="template-placeholder-label">{label}</span>
    {metadata && <span className="template-placeholder-meta">{metadata}</span>}
  </div>;
}
