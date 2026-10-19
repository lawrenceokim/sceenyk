"use client";

import Link from "next/link";
import { ArrowUpRight, ShoppingBag, UsersRound, Wallet } from "lucide-react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Button } from "@/components/ui/button";
import { usd } from "@/lib/marketplace/payments/contract";
import type { OwnedListing } from "@/lib/marketplace/contract";
import { TemplateCover } from "./listing-card";
import { templateAppearance } from "./template-appearance";

export function ManageTemplateCard({ listing }: { listing: OwnedListing }) {
  return <article className="workspace-gallery-card marketplace-listing-card manage-template-card" style={templateAppearance(listing)}>
    <div className="marketplace-card-preview">
      <TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} />
      <span className="manage-template-status">{listing.status}</span>
    </div>
    <div className="manage-template-copy">
      <h3 className="line-clamp-1" title={listing.title}>{listing.title}</h3>
      <p className="manage-template-description line-clamp-2">{listing.description}</p>
      <dl className="manage-template-stats">
        <div><dt><UsersRound aria-hidden="true" />Adoptions</dt><dd>{listing.adoptionCount.toLocaleString()}</dd></div>
        <div><dt title="Paid template sales"><ShoppingBag aria-hidden="true" />Sales</dt><dd>{listing.paidSalesCount.toLocaleString()}</dd></div>
        <div><dt title="Creator earnings"><Wallet aria-hidden="true" />Earnings</dt><dd>{usd(listing.creatorEarningsMinor)}</dd></div>
      </dl>
      <div className="manage-template-actions">
        <Button nativeButton={false} size="xs" render={<Link href={`/settings/templates/${listing.id}`} />}>{listing.status === "archived" ? "View listing" : "Manage listing"}</Button>
        {listing.status === "published" ? <Tooltip.Root>
          <Tooltip.Trigger render={<Button nativeButton={false} variant="outline" size="icon-xs" render={<Link href={`/marketplace/${listing.id}`} />} aria-label="View public listing" />}><ArrowUpRight aria-hidden="true" /></Tooltip.Trigger>
          <Tooltip.Portal><Tooltip.Positioner side="bottom" sideOffset={6} className="z-[70]"><Tooltip.Popup className="manage-template-tooltip">View public listing</Tooltip.Popup></Tooltip.Positioner></Tooltip.Portal>
        </Tooltip.Root> : <Button variant="outline" size="icon-xs" disabled aria-label="Public listing unavailable until published"><ArrowUpRight aria-hidden="true" /></Button>}
      </div>
    </div>
  </article>;
}
