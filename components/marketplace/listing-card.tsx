import Link from "next/link";
import { ArrowUpRight, Layers3, Store } from "lucide-react";
import { creationCategories } from "@/components/creation/creation-options";
import { Button } from "@/components/ui/button";
import type { Listing, TemplateSnapshot } from "@/lib/marketplace/contract";
import { usd } from "@/lib/marketplace/payments/contract";

export function TemplateCover({ template, large = false }: { template: TemplateSnapshot; large?: boolean }) {
  const category = creationCategories.find(item => item.id === template.category)!;
  const Icon = category.icon;
  return <div className={`relative flex aspect-video flex-col items-center justify-center overflow-hidden bg-gradient-surface p-5 ${large ? "sm:min-h-80" : ""}`} aria-label="Template configuration preview">
    <div className="absolute -right-12 -top-16 size-56 rounded-full border-[28px] border-primary/10" aria-hidden="true" />
    <span className="relative rounded-2xl border border-border bg-card/90 p-5 text-link shadow-card"><Icon className={large ? "size-14" : "size-9"} aria-hidden="true" /></span>
    <p className="relative mt-4 text-body-sm font-semibold">{template.settings.visualStyle} · {template.settings.aspectRatio}</p>
    <p className="relative mt-1 text-caption text-muted-foreground">Template preview · {template.settings.duration}s</p>
  </div>;
}
export function GenerationEstimate({ listing }: { listing: Pick<Listing, "estimate"> }) {
  return <p className="text-body-sm text-muted-foreground">{listing.estimate
    ? `Estimated generation: ~${listing.estimate.credits} credits${listing.estimate.test ? " (test pricing)" : ""}`
    : "Generation cost: review in your project"}</p>;
}
export function ListingCard({ listing }: { listing: Listing }) {
  const category = creationCategories.find(item => item.id === listing.category)!;
  return <article className="sceenyk-card flex min-w-0 flex-col overflow-hidden">
    <Link href={`/marketplace/${listing.id}`} className="block focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-ring" aria-label={`Explore ${listing.title}`}>
      <TemplateCover template={listing.template} />
    </Link>
    <div className="flex flex-1 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-caption"><span className="text-muted-foreground">{category.title}</span><span className="rounded-full bg-accent px-2.5 py-1 font-medium text-accent-foreground">{listing.adoptionType === "free" ? "Free adoption" : "Paid · Sandbox"}</span></div>
      <h2 className="break-words text-lg font-semibold tracking-tight"><Link className="hover:text-link focus-visible:outline-2 focus-visible:outline-ring" href={`/marketplace/${listing.id}`}>{listing.title}</Link></h2>
      <p className="line-clamp-2 break-words text-body-sm text-muted-foreground">{listing.description}</p>
      <p className="text-caption text-muted-foreground">By {listing.creatorName}</p>
      {!!listing.tags.length && <div className="flex flex-wrap gap-1.5">{listing.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-2 py-1 text-caption text-muted-foreground">{tag}</span>)}</div>}
      <div className="mt-auto space-y-2 border-t border-border pt-3"><p className="text-body-sm font-medium">Creator adoption price: {listing.adoptionType === "free" ? "Free" : usd(listing.priceMinor)}</p><GenerationEstimate listing={listing} /></div>
      <Button variant="outline" className="w-full" nativeButton={false} render={<Link href={`/marketplace/${listing.id}`} />}>Explore template<ArrowUpRight className="size-4" aria-hidden="true" /></Button>
    </div>
  </article>;
}
export function MarketplaceLoading() {
  return <div aria-busy="true" role="status"><p className="mb-5 text-muted-foreground">Loading Marketplace…</p><div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="sceenyk-card h-72 bg-muted motion-safe:animate-pulse" />)}</div></div>;
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
