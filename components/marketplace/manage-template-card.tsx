"use client";

import Link from "next/link";
import { popupMotion } from "@/components/ui/motion";
import { ArrowUpRight, ShoppingBag, UsersRound, Wallet } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/marketplace/payments/contract";
import type { OwnedListing } from "@/lib/marketplace/contract";
import { TemplateCover } from "./listing-card";
import { templateAppearance } from "./template-appearance";

export function ManageTemplateCard({ listing }: { listing: OwnedListing }) {
  return <article className={`
      workspace-gallery-card marketplace-listing-card manage-template-card [&&]:min-w-[0] [&&]:flex [&&]:flex-col
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[18px] [&&]:pt-[8px] [&&]:pr-[8px] [&&]:pb-[8px] [&&]:pl-[8px]
      [&&]:[background:var(--card)] [&&]:overflow-hidden [&&_>_a:first-child]:rounded-[12px]
      [&&_>_a:first-child]:overflow-hidden max-599:[&&]:pt-[6px] max-599:[&&]:pr-[6px] max-599:[&&]:pb-[6px]
      max-599:[&&]:pl-[6px] max-599:[&&]:rounded-[14px] [.workspace-gallery-card&&]:pt-[8px]
      [.workspace-gallery-card&&]:pr-[8px] [.workspace-gallery-card&&]:pb-[8px] [.workspace-gallery-card&&]:pl-[8px]
      [.workspace-gallery-card&&]:rounded-[18px]
      [.workspace-gallery-card&&]:[background:linear-gradient(_180deg,_color-mix(in_srgb,_var(--template-color)_35%,_var(--card)),_var(--card)_)]
      [.workspace-gallery-card&&]:[transition:transform_var(--motion-popover)_var(--motion-ease)]
      [@media_(hover:_hover)]:[&&:hover]:[transform:translateY(-3px)] max-599:[.workspace-gallery-card&&]:pt-[8px]
      max-599:[.workspace-gallery-card&&]:pr-[8px] max-599:[.workspace-gallery-card&&]:pb-[8px]
      max-599:[.workspace-gallery-card&&]:pl-[8px] max-599:[.workspace-gallery-card&&]:rounded-[18px]
      [@media_(prefers-reduced-motion:_reduce)]:[.workspace-gallery-card&&]:[transition:none]
      [@media_(prefers-reduced-motion:_reduce)]:[&&:hover]:[transform:none] [.workspace-settings-inner_&&]:pt-[8px]
      [.workspace-settings-inner_&&]:pr-[8px] [.workspace-settings-inner_&&]:pb-[8px] [.workspace-settings-inner_&&]:pl-[8px]
      [.workspace-settings-inner_&&]:[background:linear-gradient(180deg,_color-mix(in_srgb,_var(--template-color)_18%,_var(--card)),_var(--card)_90%)]
      [.dark_.workspace-settings-inner_&&]:[background:linear-gradient(180deg,_color-mix(in_srgb,_var(--template-color)_24%,_var(--card)),_var(--card)_90%)]
    `} style={templateAppearance(listing)}>
    <div className={"marketplace-card-preview [&&]:relative [&&]:shrink-0 [&&]:overflow-hidden [&&]:rounded-[12px] [.manage-template-card_&&]:rounded-[10px]"}>
      <TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} />
      <span className={"manage-template-status [.manage-template-card_&&]:absolute [.manage-template-card_&&]:z-[1] [.manage-template-card_&&]:top-[7px] [.manage-template-card_&&]:left-[7px] [.manage-template-card_&&]:max-w-[calc(100%_-_14px)] [.manage-template-card_&&]:pt-[2px] [.manage-template-card_&&]:pr-[6px] [.manage-template-card_&&]:pb-[2px] [.manage-template-card_&&]:pl-[6px] [.manage-template-card_&&]:rounded-[5px] [.manage-template-card_&&]:[background:var(--accent)] [.manage-template-card_&&]:text-[color:var(--accent-foreground)] [.manage-template-card_&&]:text-[length:10px] [.manage-template-card_&&]:leading-[14px] [.manage-template-card_&&]:font-[500] [.manage-template-card_&&]:capitalize"}>{listing.status}</span>
    </div>
    <div className={"manage-template-copy [.manage-template-card_&&]:flex [.manage-template-card_&&]:[flex:1] [.manage-template-card_&&]:flex-col [.manage-template-card_&&]:items-stretch [.manage-template-card_&&]:gap-[7px] [.manage-template-card_&&]:min-w-[0] [.manage-template-card_&&]:pt-[10px] [.manage-template-card_&&]:pr-[0] [.manage-template-card_&&]:pb-[0] [.manage-template-card_&&]:pl-[0] [.manage-template-card_&&]:text-left [.manage-template-card_&&_h3]:mt-[0] [.manage-template-card_&&_h3]:mr-[0] [.manage-template-card_&&_h3]:mb-[0] [.manage-template-card_&&_h3]:ml-[0] [.manage-template-card_&&_h3]:text-[color:var(--foreground)] [.manage-template-card_&&_h3]:text-[length:13px] [.manage-template-card_&&_h3]:leading-[18px] [.manage-template-card_&&_h3]:font-[600] [.manage-template-card_&&_h3]:[overflow-wrap:anywhere]"}>
      <h3 className="line-clamp-1" title={listing.title}>{listing.title}</h3>
      <p className={"manage-template-description line-clamp-2 [.workspace-settings-inner_.manage-template-card_&&]:mt-[0] [.workspace-settings-inner_.manage-template-card_&&]:mr-[0] [.workspace-settings-inner_.manage-template-card_&&]:mb-[0] [.workspace-settings-inner_.manage-template-card_&&]:ml-[0] [.workspace-settings-inner_.manage-template-card_&&]:text-[color:var(--muted-foreground)] [.workspace-settings-inner_.manage-template-card_&&]:text-[length:11px] [.workspace-settings-inner_.manage-template-card_&&]:leading-[17px] [.workspace-settings-inner_.manage-template-card_&&]:[overflow-wrap:anywhere]"}>{listing.description}</p>
      <dl className={`
      manage-template-stats [&&]:grid [&&]:gap-[3px] [&&]:mt-[2px] [&&]:mr-[0] [&&]:mb-[0] [&&]:ml-[0]
      [&&]:text-[length:11px] [&&]:leading-[17px] [&&_>_div]:flex [&&_>_div]:items-baseline [&&_>_div]:justify-between
      [&&_>_div]:gap-[8px] [&&_>_div]:min-w-[0] [&&_dt]:inline-flex [&&_dt]:items-center [&&_dt]:gap-[5px]
      [&&_dt]:text-[color:var(--muted-foreground)] [&&_svg]:w-[12px] [&&_svg]:h-[12px] [&&_svg]:shrink-0
      [&&_svg]:[stroke-width:1.5] [&&_dd]:min-w-[0] [&&_dd]:text-[color:var(--foreground)] [&&_dd]:text-right
      [&&_dd]:[font-variant-numeric:tabular-nums] [&&_dd]:[overflow-wrap:anywhere]
    `}>
        <div><dt><UsersRound aria-hidden="true" />Adoptions</dt><dd>{listing.adoptionCount.toLocaleString()}</dd></div>
        <div><dt title="Paid template sales"><ShoppingBag aria-hidden="true" />Sales</dt><dd>{listing.paidSalesCount.toLocaleString()}</dd></div>
        <div><dt title="Creator earnings"><Wallet aria-hidden="true" />Earnings</dt><dd>{usd(listing.creatorEarningsMinor)}</dd></div>
      </dl>
      <div className={`
      manage-template-actions [&&]:flex [&&]:items-center [&&]:gap-[6px] [&&]:mt-[auto] [&&]:pt-[3px]
      [.workspace-settings-inner_&&_[data-slot='button']]:shrink-0
      [.workspace-settings-inner_&&_[data-slot='button']]:w-[auto]
      [.workspace-settings-inner_&&_[data-slot='button']]:min-h-[28px]
      [.workspace-settings-inner_&&_[data-slot='button']]:pt-[4px]
      [.workspace-settings-inner_&&_[data-slot='button']]:pr-[8px]
      [.workspace-settings-inner_&&_[data-slot='button']]:pb-[4px]
      [.workspace-settings-inner_&&_[data-slot='button']]:pl-[8px]
      [.workspace-settings-inner_&&_[data-slot='button']]:text-[length:11px]
      [.workspace-settings-inner_&&_[data-slot='button']]:leading-[18px]
      [.workspace-settings-inner_&&_[data-slot='button']:last-child]:w-[28px]
      [.workspace-settings-inner_&&_[data-slot='button']:last-child]:h-[28px]
      [.workspace-settings-inner_&&_[data-slot='button']:last-child]:pt-[0]
      [.workspace-settings-inner_&&_[data-slot='button']:last-child]:pr-[0]
      [.workspace-settings-inner_&&_[data-slot='button']:last-child]:pb-[0]
      [.workspace-settings-inner_&&_[data-slot='button']:last-child]:pl-[0]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&_[data-slot='button']]:min-h-[44px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&_[data-slot='button']:last-child]:w-[44px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&_[data-slot='button']:last-child]:h-[44px]
    `}>
        <Button nativeButton={false} size="xs" render={<Link href={`/settings/templates/${listing.id}`} />}>{listing.status === "archived" ? "View listing" : "Manage listing"}</Button>
        {listing.status === "published" ? <Tooltip.Root>
          <Tooltip.Trigger render={<Button nativeButton={false} variant="outline" size="icon-xs" render={<Link href={`/marketplace/${listing.id}`} />} aria-label="View public listing" />}><ArrowUpRight aria-hidden="true" /></Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Positioner side="bottom" sideOffset={6} className="z-[70]"><Tooltip.Popup className={`${popupMotion}
      manage-template-tooltip [&&]:max-w-[220px] [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[6px] [&&]:pt-[4px]
      [&&]:pr-[7px] [&&]:pb-[4px] [&&]:pl-[7px] [&&]:[background:var(--popover)] [&&]:text-[color:var(--popover-foreground)]
      [&&]:text-[length:11px] [&&]:leading-[16px]
    `}>View public listing</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
        </Tooltip.Root> : <Button variant="outline" size="icon-xs" disabled aria-label="Public listing unavailable until published"><ArrowUpRight aria-hidden="true" /></Button>}
      </div>
    </div>
  </article>;
}
