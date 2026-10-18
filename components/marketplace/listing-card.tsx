import Link from "next/link";
import { Layers3, Store } from "lucide-react";
import { creationCategories } from "@/components/creation/creation-options";
import type { Listing, TemplateSnapshot } from "@/lib/marketplace/contract";
import { CreatorAvatar } from "./creator-avatar";
import { templateAppearance } from "./template-appearance";

export function ListingCreator({ listing }: { listing: Listing }) {
  const identity = <><CreatorAvatar name={listing.creatorName} url={listing.creatorAvatar} /><span className="min-w-0 break-words">By {listing.creatorName}</span></>;
  return listing.creatorSlug ? <Link href={`/marketplace/creators/${listing.creatorSlug}`} className="nav-link flex min-h-11 items-center gap-3 text-body-sm text-muted-foreground" aria-label={`View ${listing.creatorName}’s storefront`}>{identity}</Link> : <p className="flex items-center gap-3 text-body-sm text-muted-foreground">{identity}</p>;
}

export function TemplateCover({ template, large = false }: { template: TemplateSnapshot; large?: boolean }) {
  const category = creationCategories.find(item => item.id === template.category)!;
  const Icon = category.icon;
  return <div className="workspace-template-cover" data-large={large} style={templateAppearance(template)} aria-label="Template configuration preview">
    <span><Icon className={large ? "size-14" : "size-7"} aria-hidden="true" /></span>
    <p className="font-medium">{template.settings.visualStyle} · {template.settings.aspectRatio}</p>
    <p className="text-muted-foreground">Configuration preview · {template.settings.duration}s</p>
  </div>;
}
export function GenerationEstimate({ listing }: { listing: Pick<Listing, "estimate"> }) {
  return <p className="text-body-sm text-muted-foreground">{listing.estimate
    ? `Estimated generation: ~${listing.estimate.credits} credits${listing.estimate.test ? " (test pricing)" : ""}`
    : "Generation cost: review in your project"}</p>;
}
export function ListingCard({ listing }: { listing: Listing }) {
  const category = creationCategories.find(item => item.id === listing.category)!;
  return <article className="workspace-gallery-card marketplace-listing-card" style={templateAppearance(listing.template)}>
    <Link href={`/marketplace/${listing.id}`} className="marketplace-card-link" aria-label={`Explore ${listing.title}`}>
      <TemplateCover template={listing.template} />
      <div className="workspace-gallery-copy">
        <h2 className="line-clamp-1 break-words">{listing.title}</h2>
        <p className="line-clamp-2 break-words text-body-sm text-muted-foreground">{listing.description}</p>
        <div className="marketplace-tags"><span>{category.title}</span>{listing.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
      </div>
    </Link>
  </article>;
}
export function MarketplaceLoading() {
  return <div aria-busy="true" role="status"><p className="mb-5 text-muted-foreground">Loading Marketplace…</p><div className="workspace-gallery">{Array.from({ length: 6 }, (_, i) => <div key={i} className="workspace-gallery-card h-72 bg-muted motion-safe:animate-pulse" />)}</div></div>;
}
export function MarketplaceFailure({ href = "/marketplace" }: { href?: string }) {
  return <section className="sceenyk-card space-y-3 p-6" role="alert"><Store className="size-6 text-link" aria-hidden="true" /><h2 className="text-lg font-semibold">Marketplace is temporarily unavailable</h2><p className="text-body-sm text-muted-foreground">We couldn’t load these listings. Please try again.</p><Link href={href} className="nav-link text-link">Reload listings</Link></section>;
}
export function TemplateInformation({ template }: { template: TemplateSnapshot }) {
  return <section className="sceenyk-card space-y-4 p-5 sm:p-6" aria-label="Reusable template configuration">
    <h2 className="flex items-center gap-2 text-lg font-semibold"><Layers3 className="size-5 text-link" aria-hidden="true" />What you’ll adopt</h2>
    <dl className="grid grid-cols-2 gap-4 text-body-sm">{Object.entries({ Format: template.settings.aspectRatio, Duration: `${template.settings.duration} seconds`, Style: template.settings.visualStyle, Tone: template.settings.tone }).map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>)}</dl>
    <div><h3 className="text-body-sm font-semibold">Reusable instructions</h3><p className="mt-2 whitespace-pre-wrap break-words text-body-sm leading-relaxed text-muted-foreground">{template.instructions}</p></div>
    <p className="border-t border-border pt-4 text-caption text-muted-foreground">You’ll get your own editable project. Add your own ideas and media. Creator uploads and generated media are excluded.</p>
  </section>;
}
