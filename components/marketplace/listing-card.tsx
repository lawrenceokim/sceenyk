import Link from "next/link";
import { ArrowUpRight, Layers3, Store } from "lucide-react";
import { creationCategories } from "@/components/creation/creation-options";
import type { Listing, TemplateSnapshot } from "@/lib/marketplace/contract";
import { CreatorAvatar } from "./creator-avatar";
import { templateAppearance } from "./template-appearance";
import { AbstractPreview } from "./abstract-preview";

export function ListingCreator({ listing }: { listing: Listing }) {
  const identity = <><CreatorAvatar name={listing.creatorName} url={listing.creatorAvatar} /><span className="min-w-0 break-words">By {listing.creatorName}</span></>;
  return listing.creatorSlug ? <Link href={`/marketplace/creators/${listing.creatorSlug}`} className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link flex min-h-11 items-center
      gap-3 text-body-sm text-muted-foreground [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `} aria-label={`View ${listing.creatorName}’s storefront`}>{identity}</Link> : <p className="flex items-center gap-3 text-body-sm text-muted-foreground">{identity}</p>;
}

export function TemplateCover({ template, fallbackColor, previewId, large = false }: { template: TemplateSnapshot; fallbackColor?: string | null; previewId?: string; large?: boolean }) {
  return <AbstractPreview previewId={previewId} fallbackColor={fallbackColor} large={large} metadata={`${template.settings.visualStyle} · ${template.settings.aspectRatio} · ${template.settings.duration}s`} />;
}
export function GenerationEstimate({ listing }: { listing: Pick<Listing, "estimate"> }) {
  return <p className="text-body-sm text-muted-foreground">{listing.estimate
    ? `Estimated generation: ~${listing.estimate.credits} credits${listing.estimate.test ? " (test pricing)" : ""}`
    : "Generation cost: review in your project"}</p>;
}
export function ListingCard({ listing }: { listing: Listing }) {
  const category = creationCategories.find(item => item.id === listing.category)!;
  return <article className={`
      workspace-gallery-card marketplace-listing-card [&&]:min-w-[0] [&&]:flex [&&]:flex-col
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[18px] [&&]:pt-[8px] [&&]:pr-[8px] [&&]:pb-[8px] [&&]:pl-[8px]
      [&&]:[background:var(--card)] [&&]:overflow-hidden [&&_>_a:first-child]:rounded-[12px]
      [&&_>_a:first-child]:overflow-hidden max-599:[&&]:pt-[6px] max-599:[&&]:pr-[6px] max-599:[&&]:pb-[6px]
      max-599:[&&]:pl-[6px] max-599:[&&]:rounded-[14px] [.workspace-gallery-card&&]:pt-[8px]
      [.workspace-gallery-card&&]:pr-[8px] [.workspace-gallery-card&&]:pb-[8px] [.workspace-gallery-card&&]:pl-[8px]
      [.workspace-gallery-card&&]:rounded-[18px]
      [.workspace-gallery-card&&]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color)_35%,_var(--card)),_var(--card)_)]
      [.workspace-gallery-card&&]:[transition:transform_220ms_ease]
      [@media_(hover:_hover)]:[&&:hover]:[transform:translateY(-3px)] max-599:[.workspace-gallery-card&&]:pt-[8px]
      max-599:[.workspace-gallery-card&&]:pr-[8px] max-599:[.workspace-gallery-card&&]:pb-[8px]
      max-599:[.workspace-gallery-card&&]:pl-[8px] max-599:[.workspace-gallery-card&&]:rounded-[18px]
      [@media_(prefers-reduced-motion:_reduce)]:[.workspace-gallery-card&&]:[transition:none]
      [@media_(prefers-reduced-motion:_reduce)]:[&&:hover]:[transform:none]
    `} style={templateAppearance(listing)}>
    <Link href={`/marketplace/${listing.id}`} className={`
      marketplace-card-link [.workspace-gallery-card_>_&&:first-child]:flex
      [.workspace-gallery-card_>_&&:first-child]:[flex:1] [.workspace-gallery-card_>_&&:first-child]:flex-col
      [.workspace-gallery-card_>_&&:first-child]:overflow-visible [.workspace-gallery-card_>_&&:first-child]:rounded-[10px]
      [&&:focus-visible]:[outline:2px_solid_var(--ring)] [&&:focus-visible]:[outline-offset:3px]
    `} aria-label={`Explore ${listing.title}`}>
      <div className={"marketplace-card-preview [&&]:relative [&&]:shrink-0 [&&]:overflow-hidden [&&]:rounded-[12px] [.manage-template-card_&&]:rounded-[10px]"}><TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} /><span className={`
      marketplace-card-arrow [&&]:absolute [&&]:top-[8px] [&&]:right-[8px] [&&]:flex [&&]:w-[24px] [&&]:h-[24px]
      [&&]:items-center [&&]:justify-center [&&]:rounded-[999px] [&&]:[background:#0007] [&&]:text-[color:#fff]
      [&&]:opacity-[0] [&&]:[transition:opacity_200ms_ease] [&&_svg]:w-[13px] [&&_svg]:h-[13px]
      [.marketplace-listing-card:focus-within_&&]:opacity-[1]
      [@media_(hover:_hover)]:[.marketplace-listing-card:hover_&&]:opacity-[1] [@media_(hover:_none)]:[&&]:opacity-[1]
      [@media_(prefers-reduced-motion:_reduce)]:[&&]:[transition:none]
    `} aria-hidden="true"><ArrowUpRight /></span></div>
      <div className={`
      workspace-gallery-copy [.marketplace-listing-card_&&]:[flex:1] [.marketplace-listing-card_&&]:gap-[6px]
      [.marketplace-listing-card_&&]:pt-[10px] [.marketplace-listing-card_&&]:pr-[3px]
      [.marketplace-listing-card_&&]:pb-[2px] [.marketplace-listing-card_&&]:pl-[3px]
      [.marketplace-listing-card_&&_h2]:text-[length:14px] [.marketplace-listing-card_&&_h2]:leading-[18px]
      [.marketplace-listing-card_&&_h2]:font-[650] [.marketplace-listing-card_&&_>_p]:min-h-[32px]
      [.marketplace-listing-card_&&_>_p]:text-[length:12px] [.marketplace-listing-card_&&_>_p]:leading-[16px]
      max-599:[.marketplace-listing-card_&&_h2]:text-[length:13px] [&&]:flex [&&]:[flex:1] [&&]:flex-col [&&]:gap-[6px]
      [&&]:pt-[10px] [&&]:pr-[3px] [&&]:pb-[2px] [&&]:pl-[3px] [&&_h2]:text-[length:14px] [&&_h2]:leading-[20px]
      [&&_h2]:font-[600] [&&_h2]:tracking-[-.025em] [&&_>_p]:text-[length:12px] [&&_>_p]:leading-[16px]
      [&&_>_a]:text-[length:12px] [&&_>_a]:leading-[16px] [&&_>_div]:text-[length:12px] [&&_>_div]:leading-[16px]
      [&&_.rounded-full.shrink-0]:w-[20px] [&&_.rounded-full.shrink-0]:h-[20px]
      [&&_.rounded-full.shrink-0]:text-[length:10px] [&&_[data-slot='button']]:h-[30px]
      [&&_[data-slot='button']]:min-h-[30px] [&&_[data-slot='button']]:text-[length:12px] [&&_img]:w-[20px] [&&_img]:h-[20px]
      [&&_>_div:last-child:has(a[href^='/settings/templates/'])]:gap-x-[8px]
      [&&_>_div:last-child:has(a[href^='/settings/templates/'])]:text-[length:11px] max-599:[&&]:pl-[2px]
      max-599:[&&]:pr-[2px] max-599:[&&_h2]:text-[length:13px]
    `}>
        <h2 className="line-clamp-1 break-words">{listing.title}</h2>
        <p className="line-clamp-2 break-words text-body-sm text-muted-foreground">{listing.description}</p>
        <div className={`
      marketplace-tags [&&]:flex [&&]:flex-wrap [&&]:gap-[4px] [&&]:min-w-[0] [&&_>_span]:max-w-[100%]
      [&&_>_span]:[border:1px_solid_var(--border)] [&&_>_span]:rounded-[999px] [&&_>_span]:pt-[1px] [&&_>_span]:pr-[6px]
      [&&_>_span]:pb-[1px] [&&_>_span]:pl-[6px] [&&_>_span]:text-[color:var(--muted-foreground)]
      [&&_>_span]:text-[length:10px] [&&_>_span]:font-[500] [&&_>_span]:leading-[16px] [&&_>_span]:[overflow-wrap:anywhere]
      [.marketplace-listing-card_&&]:mt-[auto] [.marketplace-listing-card_&&]:pt-[3px]
      [.marketplace-detail-info_>_&&_>_span]:[border-color:transparent]
      [.marketplace-detail-info_>_&&_>_span]:[background:color-mix(in_srgb,_var(--foreground)_6%,_transparent)]
      [.marketplace-detail-info_>_&&_>_span]:pt-[2px] [.marketplace-detail-info_>_&&_>_span]:pr-[8px]
      [.marketplace-detail-info_>_&&_>_span]:pb-[2px] [.marketplace-detail-info_>_&&_>_span]:pl-[8px]
      [.marketplace-detail-info_>_&&_>_span]:text-[color:var(--foreground)] max-599:[&&]:gap-[4px]
      max-599:[&&_>_span]:pl-[5px] max-599:[&&_>_span]:pr-[5px] max-599:[&&_>_span]:text-[length:10px]
      max-599:[&&_>_span]:leading-[16px]
    `}><span>{category.title}</span>{listing.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
      </div>
    </Link>
  </article>;
}
export function MarketplaceLoading() {
  return <div aria-busy="true" role="status"><p className="mb-5 text-muted-foreground">Loading Marketplace…</p><div className={"workspace-gallery [[data-workspace-shell]_&&]:grid [[data-workspace-shell]_&&]:[grid-template-columns:repeat(auto-fill,minmax(min(100%,180px),1fr))] [[data-workspace-shell]_&&]:gap-[16px] max-599:[[data-workspace-shell]_&&]:[grid-template-columns:repeat(2,minmax(0,1fr))] max-599:[[data-workspace-shell]_&&]:gap-[8px] max-359:[[data-workspace-shell]_&&]:[grid-template-columns:minmax(0,1fr)]"}>{Array.from({ length: 6 }, (_, i) => <div key={i} className={`
      workspace-gallery-card h-72 bg-muted motion-safe:animate-pulse [&&]:min-w-[0] [&&]:flex [&&]:flex-col
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[18px] [&&]:pt-[8px] [&&]:pr-[8px] [&&]:pb-[8px] [&&]:pl-[8px]
      [&&]:[background:var(--card)] [&&]:overflow-hidden [&&_>_a:first-child]:rounded-[12px]
      [&&_>_a:first-child]:overflow-hidden max-599:[&&]:pt-[6px] max-599:[&&]:pr-[6px] max-599:[&&]:pb-[6px]
      max-599:[&&]:pl-[6px] max-599:[&&]:rounded-[14px]
    `} />)}</div></div>;
}
export function MarketplaceFailure({ href = "/marketplace" }: { href?: string }) {
  return <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-3 p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} role="alert"><Store className="size-6 text-link" aria-hidden="true" /><h2 className="text-lg font-semibold">Marketplace is temporarily unavailable</h2><p className="text-body-sm text-muted-foreground">We couldn’t load these listings. Please try again.</p><Link href={href} className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link text-link
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}>Reload listings</Link></section>;
}
export function TemplateInformation({ template }: { template: TemplateSnapshot }) {
  return <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-4 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} aria-label="Reusable template configuration">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Layers3 className="size-5 text-link" aria-hidden="true" />What you’ll adopt</h2>
    <dl className="grid grid-cols-2 gap-4 text-body-sm">{Object.entries({ Format: template.settings.aspectRatio, Duration: `${template.settings.duration} seconds`, Style: template.settings.visualStyle, Tone: template.settings.tone }).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
    <div><h3 className="text-body-sm font-semibold">Reusable instructions</h3><p className="mt-2 whitespace-pre-wrap break-words text-body-sm leading-relaxed text-muted-foreground">{template.instructions}</p></div>
    <p className="border-t border-border pt-4 text-caption text-muted-foreground">You’ll get your own editable project. Add your own ideas and media. Creator uploads and generated media are excluded.</p>
  </section>;
}
