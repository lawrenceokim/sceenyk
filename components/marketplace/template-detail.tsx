import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import type { Listing } from "@/lib/marketplace/contract";
import { creationCategories } from "@/components/creation/creation-options";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/marketplace/payments/contract";
import { AdoptButton } from "./adopt-button";
import { GenerationEstimate, ListingCreator, TemplateCover, TemplateInformation } from "./listing-card";
import { templateAppearance } from "./template-appearance";

export function TemplateDetail({ listing, owned = false, children }: { listing: Listing; owned?: boolean; children?: ReactNode }) {
  const category = creationCategories.find(item => item.id === listing.category)!;
  return <div className={`
      marketplace-detail
      [.workspace-content_.workspace-page[data-workspace-page='content'][data-workspace-view='template-detail']_>_&&]:mt-[0]
      [&&]:relative [&&]:isolate [&&]:min-w-[0] [&&]:pt-[54px] [&&]:pr-[24px] [&&]:pb-[32px] [&&]:pl-[24px]
      [&&]:rounded-[var(--ui-radius-frame)] [&&]:[container-type:inline-size] [&&::before]:absolute [&&::before]:z-[-1]
      [&&::before]:top-[0] [&&::before]:right-[0] [&&::before]:left-[0] [&&::before]:h-[620px] [&&::before]:max-h-[100%]
      [&&::before]:rounded-[var(--ui-radius-frame)_var(--ui-radius-frame)_0_0]
      [&&::before]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color,_var(--muted))_48%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_22%,_var(--card))_40%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_5%,_var(--card))_72%,_var(--card)_100%_)]
      [&&::before]:[content:''] [&&::before]:pointer-events-none
      [.dark_&&::before]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color,_var(--muted))_65%,_var(--card))_0%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_30%,_var(--card))_40%,_color-mix(in_srgb,_var(--template-color,_var(--muted))_7%,_var(--card))_72%,_var(--card)_100%_)]
      max-1023:[&&]:pt-[40px] max-599:[&&]:pt-[40px] max-599:[&&]:pr-[16px] max-599:[&&]:pb-[24px] max-599:[&&]:pl-[16px]
      max-599:[&&::before]:h-[570px]
    `} style={templateAppearance(listing)}>
    <Link className={`
      marketplace-back [&&:focus-visible]:[outline:2px_solid_var(--ring)] [&&:focus-visible]:[outline-offset:3px]
      [&&]:inline-flex [&&]:items-center [&&]:gap-[5px] [&&]:min-h-[24px] [&&]:mb-[24px] [&&]:pt-[3px] [&&]:pr-[8px]
      [&&]:pb-[3px] [&&]:pl-[8px] [&&]:rounded-[7px] [&&]:[background:color-mix(in_srgb,_var(--foreground)_5%,_transparent)]
      [&&]:text-[length:12px] [&&]:font-[600] [&&]:leading-[18px]
      [&&:hover]:[background:color-mix(in_srgb,_var(--foreground)_9%,_transparent)]
    `} href={owned ? "/templates" : "/marketplace"}><ArrowLeft className="size-3" aria-hidden="true" />{owned ? "Templates" : "Marketplace"}</Link>
    <div className={`
      marketplace-detail-main [&&]:grid [&&]:min-w-[0] [&&]:[align-items:start] [&&]:gap-[36px]
      @min-[860px]:[&&]:[grid-template-columns:minmax(0,_2.2fr)_minmax(0,_1fr)] @min-[860px]:[&&]:gap-[40px]
      max-599:[&&]:gap-[38px]
    `}>
      <div className={"marketplace-detail-preview [&&]:min-w-[0] [&&]:overflow-hidden [&&]:rounded-[12px]"}><TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} large /></div>
      <div className={`
      marketplace-detail-info [&&]:flex [&&]:min-w-[0] [&&]:flex-col [&&]:items-start [&&]:gap-[18px] [&&]:pt-[1px]
      [&&]:[overflow-wrap:anywhere] [.workspace-page[data-workspace-page='content']_&&_h1]:text-[length:30px]
      [.workspace-page[data-workspace-page='content']_&&_h1]:font-[700]
      [.workspace-page[data-workspace-page='content']_&&_h1]:leading-[1.15]
      [.workspace-page[data-workspace-page='content']_&&_h1]:tracking-[-0.035em] container-max-859:[&&]:gap-[18px]
      max-599:[&&]:gap-[18px]
    `}>
        <h1>{listing.title}</h1>
        <p className={"marketplace-detail-description [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:16px] [&&]:leading-[24px] [&&]:[white-space:pre-wrap]"}>{listing.description}</p>
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
    `}><span>{category.title}</span>{listing.tags.map(tag => <span key={tag}>{tag}</span>)}{owned && <span className="capitalize">{listing.status}</span>}</div>
        <ListingCreator listing={listing} />
        <div className={`
      marketplace-detail-price [&&]:w-[100%] [&&_>_p:first-child]:flex [&&_>_p:first-child]:flex-wrap
      [&&_>_p:first-child]:items-baseline [&&_>_p:first-child]:gap-[6px_10px]
      [&&_>_p:first-child_>_span]:text-[color:var(--muted-foreground)] [&&_>_p:first-child_>_span]:text-[length:12px]
      [&&_strong]:text-[length:18px] [&&_strong]:font-[650] [&&_>_p_+_p]:mt-[6px] [&&_>_p_+_p]:text-[length:12px]
      [&&_>_p_+_p]:leading-[18px]
    `}><p><span>Adoption price</span><strong>{listing.adoptionType === "free" ? "Free" : usd(listing.priceMinor)}</strong>{listing.adoptionType === "paid" && <span>USD · PayPal Sandbox</span>}</p><GenerationEstimate listing={listing} /></div>
        <div className={`
      marketplace-detail-adopt [&&]:w-[100%] [&&]:max-w-[310px] [&&_[data-slot='button']]:h-[auto]
      [&&_[data-slot='button']]:min-h-[34px] [&&_[data-slot='button']]:rounded-[8px] [&&_[data-slot='button']]:pt-[8px]
      [&&_[data-slot='button']]:pr-[12px] [&&_[data-slot='button']]:pb-[8px] [&&_[data-slot='button']]:pl-[12px]
      [&&_[data-slot='button']]:text-[length:12px] [&&_[data-slot='button']]:leading-[18px]
      [&&_[data-slot='button']]:whitespace-normal
    `}>{owned ? <div className="grid gap-3">
          <Button nativeButton={false} render={<Link href={`/settings/templates/${listing.id}`} />}>Update Template</Button>
          {listing.status === "published" && <Button variant="outline" nativeButton={false} render={<Link href={`/marketplace/${listing.id}`} />}>View in Marketplace</Button>}
        </div> : <AdoptButton listingId={listing.id} paid={listing.adoptionType === "paid"} estimate={listing.estimate} />}</div>
        <p className={"marketplace-detail-note [&&]:max-w-[48ch] [&&]:text-[color:var(--muted-foreground)] [&&]:text-[length:12px] [&&]:leading-[18px]"}>{owned ? "This is your reusable template. Your original project and private media remain separate." : "Adoption creates your own editable project; creator media stays private. AI generation is separate, with a quote shown before you generate."}</p>
        <details className={`
      marketplace-configuration [&&_summary:focus-visible]:[outline:2px_solid_var(--ring)]
      [&&_summary:focus-visible]:[outline-offset:3px] [&&]:w-[100%]
      [&&]:[border-top:1px_solid_color-mix(in_srgb,_var(--foreground)_10%,_transparent)] [&&]:pt-[12px]
      [&&_summary]:w-[fit-content] [&&_summary]:cursor-pointer [&&_summary]:text-[color:var(--muted-foreground)]
      [&&_summary]:text-[length:12px] [&&_summary]:font-[500] [&&_h2]:text-[length:14px] [&&_p]:text-[length:12px]
      [&&_p]:leading-[18px] [&&_dl]:text-[length:12px] [&&_dl]:leading-[18px] [&&_h3]:text-[length:12px]
      [&&_h3]:leading-[18px]
    `}><summary>{owned ? "Template configuration" : "What you’ll adopt"}</summary><TemplateInformation template={listing.template} /></details>
      </div>
    </div>
    {children}
  </div>;
}
