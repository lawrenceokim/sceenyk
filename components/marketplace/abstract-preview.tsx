import { templateAppearance, templatePattern } from "./template-appearance";

export function AbstractPreview({ previewId, fallbackColor, label = "Template preview", metadata, large = false, ariaLabel = "Abstract template placeholder; not generated media" }: {
  previewId?: string;
  fallbackColor?: string | null;
  label?: string;
  metadata?: string;
  large?: boolean;
  ariaLabel?: string;
}) {
  return <div className={`
      workspace-template-cover template-placeholder [.marketplace-card-preview_&&]:[aspect-ratio:4_/_3]
      [.marketplace-card-preview_&&]:[border:0] [.marketplace-card-preview_&&]:rounded-[0]
      [.marketplace-card-preview_&&]:[transition:transform_var(--motion-popover)_var(--motion-ease)]
      [@media_(hover:_hover)]:[.marketplace-listing-card:hover_&&]:[transform:scale(1.04)]
      [.marketplace-detail-preview_&&[data-large='true']]:min-h-[0]
      [.marketplace-detail-preview_&&[data-large='true']]:[aspect-ratio:1]
      [.marketplace-detail-preview_&&[data-large='true']]:rounded-[inherit]
      [.marketplace-detail-preview_&&_p]:text-[length:13px] [.marketplace-detail-preview_&&_p]:leading-[20px]
      [.template-saved-card_&&]:w-[100%] [.template-saved-card_&&]:h-[100%]
      max-599:[.marketplace-card-link_&&]:[aspect-ratio:4_/_3] max-599:[.marketplace-card-link_&&]:pt-[8px]
      max-599:[.marketplace-card-link_&&]:pr-[8px] max-599:[.marketplace-card-link_&&]:pb-[8px]
      max-599:[.marketplace-card-link_&&]:pl-[8px] max-599:[.marketplace-card-link_&&]:gap-[4px]
      [@media_(prefers-reduced-motion:_reduce)]:[.marketplace-card-preview_&&]:[transition:none]
      [@media_(prefers-reduced-motion:_reduce)]:[.marketplace-listing-card:hover_&&]:[transform:none] [&&]:relative [&&]:flex
      [&&]:[aspect-ratio:4/3] [&&]:flex-col [&&]:items-center [&&]:justify-center [&&]:gap-[8px] [&&]:overflow-hidden
      [&&]:[background:color-mix(in_srgb,_var(--template-color,_var(--field))_65%,_var(--card))] [&&]:pt-[12px]
      [&&]:pr-[12px] [&&]:pb-[12px] [&&]:pl-[12px] [&&_>_span]:text-[color:var(--link)] [&&_p]:max-w-[100%]
      [&&_p]:text-center [&&_p]:text-[length:11px] [&&_p]:leading-[16px] [&&[data-large='true']]:min-h-[280px]
      [&&[data-large='true']]:[aspect-ratio:16/9] [.workspace-template-cover&&]:isolate [.workspace-template-cover&&]:block
      [.workspace-template-cover&&]:pt-[0] [.workspace-template-cover&&]:pr-[0] [.workspace-template-cover&&]:pb-[0]
      [.workspace-template-cover&&]:pl-[0] [.workspace-template-cover&&]:[background:var(--template-color)]
      [.workspace-template-cover&&]:[--preview-light:color-mix(in_srgb,_var(--template-color)_55%,_#e0d9f0)]
      [.workspace-template-cover&&]:[--preview-deep:color-mix(in_srgb,_var(--template-color)_62%,_#101829)]
      [&&::before]:absolute [&&::before]:z-[-1] [&&::before]:top-[0] [&&::before]:right-[0] [&&::before]:bottom-[0]
      [&&::before]:left-[0] [&&::before]:[content:''] [&&::before]:pointer-events-none
      [&&::before]:[background:radial-gradient(_ellipse_at_var(--preview-x)_var(--preview-y),_var(--preview-light),_transparent_64%_),_linear-gradient(var(--preview-angle),_var(--preview-deep),_transparent_70%)]
      [&&::after]:absolute [&&::after]:z-[-1] [&&::after]:top-[0] [&&::after]:right-[0] [&&::after]:bottom-[0]
      [&&::after]:left-[0] [&&::after]:[content:''] [&&::after]:pointer-events-none
      [&&[data-pattern='fold']::after]:[background:repeating-linear-gradient(_var(--preview-angle),_#ffffff15_0,_transparent_3%,_#10182925_6%,_transparent_10%_)]
      [&&[data-pattern='orbit']::after]:[background:radial-gradient(_ellipse_at_var(--preview-y)_var(--preview-x),_transparent_24%,_#ffffff20_25%,_transparent_28%,_#10182935_46%,_transparent_50%,_#ffffff18_66%,_transparent_70%_)]
      [&&[data-pattern='ripple']::after]:[background:repeating-radial-gradient(_ellipse_at_var(--preview-x)_120%,_transparent_0_8%,_#ffffff18_8.5%,_transparent_9%,_#1018291a_10%,_transparent_14%_)]
      [&&[data-pattern='wash']::after]:[background:radial-gradient(ellipse_at_90%_90%,_var(--preview-deep),_transparent_60%),_radial-gradient(ellipse_at_5%_5%,_#ffffff16,_transparent_50%)]
      [.workspace-project-preview_&&]:h-[100%]
    `} data-large={large} data-pattern={templatePattern(previewId ?? fallbackColor ?? "template")} style={templateAppearance({ id: previewId, fallbackColor })} aria-label={ariaLabel}>
    <span className={"template-placeholder-label [.template-placeholder_&&]:absolute [.template-placeholder_&&]:left-[10px] [.template-placeholder_&&]:bottom-[10px] [.template-placeholder_&&]:pt-[3px] [.template-placeholder_&&]:pr-[6px] [.template-placeholder_&&]:pb-[3px] [.template-placeholder_&&]:pl-[6px] [.template-placeholder_&&]:rounded-[5px] [.template-placeholder_&&]:[background:#10152166] [.template-placeholder_&&]:text-[color:#fff] [.template-placeholder_&&]:text-[length:10px] [.template-placeholder_&&]:font-[500] [.template-placeholder_&&]:leading-[14px] [.template-placeholder[data-large='true']_&&]:left-[16px] [.template-placeholder[data-large='true']_&&]:bottom-[42px] [.template-saved-card_.template-placeholder_&&]:left-[5px] [.template-saved-card_.template-placeholder_&&]:bottom-[5px] [.template-saved-card_.template-placeholder_&&]:pt-[1px] [.template-saved-card_.template-placeholder_&&]:pr-[5px] [.template-saved-card_.template-placeholder_&&]:pb-[1px] [.template-saved-card_.template-placeholder_&&]:pl-[5px] [.template-saved-card_.template-placeholder_&&]:rounded-[4px] [.template-saved-card_.template-placeholder_&&]:text-[length:9px] [.workspace-project-preview_&&]:left-[6px] [.workspace-project-preview_&&]:bottom-[6px] [.workspace-project-preview_&&]:text-[length:9px] [.workspace-project-preview_&&]:leading-[14px] [.workspace-project-preview_&&]:pt-[1px] [.workspace-project-preview_&&]:pr-[5px] [.workspace-project-preview_&&]:pb-[1px] [.workspace-project-preview_&&]:pl-[5px]"}>{label}</span>
    {metadata && <span className={"template-placeholder-meta [.template-placeholder_&&]:absolute [.template-placeholder_&&]:left-[16px] [.template-placeholder_&&]:bottom-[16px] [.template-placeholder_&&]:hidden [.template-placeholder_&&]:text-[color:#fff] [.template-placeholder_&&]:text-[length:12px] [.template-placeholder_&&]:leading-[18px] [.template-placeholder[data-large='true']_&&]:block"}>{metadata}</span>}
  </div>;
}
