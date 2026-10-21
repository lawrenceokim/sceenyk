import Link from "next/link";
import { Pencil } from "lucide-react";
import type { OwnedListing } from "@/lib/marketplace/contract";
import { TemplateCover } from "@/components/marketplace/listing-card";
import { templateAppearance } from "@/components/marketplace/template-appearance";
import { TemplateDelete } from "./template-delete";

export function TemplateCard({ listing }: { listing: OwnedListing }) {
  const date = listing.publishedAt ?? listing.createdAt;
  return <article className="template-saved-card relative min-w-0 rounded-[13px] border border-border bg-[linear-gradient(180deg,color-mix(in_srgb,var(--template-color)_32%,var(--card))_0%,color-mix(in_srgb,var(--template-color)_24%,var(--card))_65%,var(--card)_100%)] p-2.5 transition-transform duration-[var(--motion-popover)] ease-[var(--motion-ease)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--template-color)_44%,var(--card))_0%,color-mix(in_srgb,var(--template-color)_30%,var(--card))_65%,var(--card)_100%)] motion-safe:hover:-translate-y-0.5 has-[.template-saved-open:focus-visible]:outline-2 has-[.template-saved-open:focus-visible]:outline-offset-3 has-[.template-saved-open:focus-visible]:outline-ring motion-reduce:transition-none" style={templateAppearance(listing)}>
    <Link href={`/templates/${listing.id}`} aria-label={`Open template ${listing.title}`} className="template-saved-open block outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[9px] bg-[var(--template-color)]">
        <TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} previewUrl={listing.previewUrl} owned />
        {listing.status !== "published" && <span className="pointer-events-none absolute top-1.5 right-1.5 rounded-full bg-card px-1.5 py-0.5 text-[9px] leading-[14px] text-foreground capitalize">{listing.status}</span>}
      </div>
      <h2 className="mx-1 mt-2.5 text-xs leading-[18px] font-semibold break-words">{listing.title}</h2>
      <time className="mx-1 mt-0.5 block text-[10px] leading-4 text-muted-foreground" dateTime={date} title={listing.publishedAt ? "Published date" : "Created date"}>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(date))}</time>
    </Link>
    <div className="relative z-10 mt-2 flex min-w-0 flex-wrap items-center gap-1">
      <Link href={`/templates/${listing.id}`} className="inline-flex min-h-[30px] items-center px-1 text-[11px] font-medium outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11">Open</Link>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        {listing.status !== "archived" && <Link href={`/settings/templates/${listing.id}`} aria-label={`Edit template ${listing.title}`} title="Edit template"
          className="flex size-[30px] items-center justify-center rounded-md text-muted-foreground outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [@media(pointer:coarse)]:size-11"><Pencil className="size-3.5" aria-hidden="true" /></Link>}
        <TemplateDelete listingId={listing.id} title={listing.title} />
      </div>
    </div>
  </article>;
}
