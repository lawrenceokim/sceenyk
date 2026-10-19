import Link from "next/link";
import { ArrowUpRight, LayoutTemplate, Pencil } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TemplateCover } from "@/components/marketplace/listing-card";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import type { ListingPage, OwnedListing } from "@/lib/marketplace/contract";
import { templateAppearance } from "@/components/marketplace/template-appearance";

// Configuration covers are the existing previews. Private project media is
// intentionally excluded from Marketplace snapshots and from this gallery.
export function TemplateLibrary({ result }: { result: ListingPage<OwnedListing> }) {
  return (
    <section id="templates" aria-label="Your template gallery" className="scroll-mt-24 space-y-8 lg:scroll-mt-8">
      {result.items.length ? (
        <ul className={`
      template-saved-gallery [&&]:grid [&&]:[grid-template-columns:repeat(auto-fill,_minmax(min(100%,_230px),_250px))]
      [&&]:gap-[16px] max-1023:[&&]:[grid-template-columns:repeat(3,_minmax(0,_1fr))]
      max-767:[&&]:[grid-template-columns:minmax(0,_1fr)]
    `}>
          {result.items.map(listing => (
            <li key={listing.id} className="min-w-0">
              <article className={`
      template-saved-card [&&_a:focus-visible]:[outline:2px_solid_var(--ring)] [&&_a:focus-visible]:[outline-offset:3px]
      [&&]:relative [&&]:min-w-[0] [&&]:overflow-hidden [&&]:rounded-[12px] [&&]:[background:var(--field)]
    `} style={templateAppearance(listing)}>
                <Link href={`/templates/${listing.id}`} aria-label={`Open template ${listing.title}`} className={"template-saved-open [&&]:relative [&&]:block [&&]:[aspect-ratio:4_/_3] [.template-saved-card_&&:focus-visible]:[outline-offset:-3px] max-599:[&&]:[aspect-ratio:4_/_3]"}>
                  <TemplateCover template={listing.template} fallbackColor={listing.fallbackColor} previewId={listing.id} />
                  <div className={`
      template-saved-caption [&&]:absolute [&&]:right-[0] [&&]:bottom-[0] [&&]:left-[0] [&&]:flex [&&]:min-h-[52px]
      [&&]:items-center [&&]:justify-between [&&]:gap-[12px] [&&]:pt-[14px] [&&]:pr-[16px] [&&]:pb-[14px] [&&]:pl-[16px]
      [&&]:[background:linear-gradient(0deg,_#0009,_#0005)] [&&]:text-[color:#fff] [&&_h2]:[display:-webkit-box]
      [&&_h2]:min-w-[0] [&&_h2]:overflow-hidden [&&_h2]:[-webkit-line-clamp:2] [&&_h2]:[-webkit-box-orient:vertical]
      [&&_h2]:[overflow-wrap:anywhere] [&&_h2]:text-[length:14px] [&&_h2]:font-[650] [&&_h2]:leading-[20px]
      [&&_h2]:tracking-[-0.02em] [&&_time]:shrink-0 [&&_time]:text-[length:12px] [&&_time]:font-[500]
      [&&_time]:leading-[18px] [&&_time]:text-[color:#ffffffe0]
    `}>
                    <h2>{listing.title}</h2>
                    <time dateTime={listing.publishedAt ?? listing.createdAt} title={listing.publishedAt ? "Published date" : "Created date"}>{new Date(listing.publishedAt ?? listing.createdAt).toLocaleDateString("en", { month: "short", day: "numeric", timeZone: "UTC" })}</time>
                  </div>
                </Link>
                <div className={`
      template-saved-actions [&&]:absolute [&&]:top-[12px] [&&]:right-[12px] [&&]:left-[12px] [&&]:flex [&&]:justify-between
      [&&]:gap-[8px] [&&]:pointer-events-none [&&_>_div]:flex [&&_>_div]:min-w-[0] [&&_>_div]:items-center
      [&&_>_div]:gap-[6px] [&&_a]:inline-flex [&&_a]:w-[28px] [&&_a]:h-[28px] [&&_a]:shrink-0 [&&_a]:items-center
      [&&_a]:justify-center [&&_a]:rounded-[999px] [&&_a]:[background:#0007] [&&_a]:text-[color:white]
      [&&_a]:pointer-events-auto [&&_a]:[transition:background-color_150ms] [&&_a:hover]:[background:#000b] [&&_svg]:w-[13px]
      [&&_svg]:h-[13px] [&&_>_a]:rounded-[8px] max-599:[&&_a]:w-[32px] max-599:[&&_a]:h-[32px] max-599:[&&_svg]:w-[14px]
      max-599:[&&_svg]:h-[14px] [@media_(prefers-reduced-motion:_reduce)]:[&&_a]:[transition:none]
    `}>
                  <div>
                    {listing.status !== "archived" && <Link href={`/settings/templates/${listing.id}`} aria-label={`Manage template ${listing.title}`} title="Manage template"><Pencil aria-hidden="true" /></Link>}
                    {listing.status !== "published" && <span className={`
      template-saved-status [&&]:overflow-hidden [&&]:pt-[2px] [&&]:pr-[7px] [&&]:pb-[2px] [&&]:pl-[7px] [&&]:rounded-[999px]
      [&&]:[background:#0008] [&&]:text-[color:white] [&&]:capitalize [&&]:text-ellipsis [&&]:text-[length:10px]
    `}>{listing.status}</span>}
                  </div>
                  <Link href={`/templates/${listing.id}`} aria-label={`View template ${listing.title}`} title="View template"><ArrowUpRight aria-hidden="true" /></Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border">
          <EmptyState icon={<LayoutTemplate className="size-7" />} title={result.page > 1 ? "No templates on this page" : "Your next starting point"}
            description={result.page > 1 ? "Return to your latest templates." : "Templates from your Marketplace listings appear here. Choose an owned saved project to publish a reusable configuration; your original project and media stay private."}
            primaryAction={<Button nativeButton={false} render={<Link href={result.page > 1 ? "/templates" : "/settings/templates/new"} />}>{result.page > 1 ? "Latest templates" : "Choose a project"}</Button>}
            secondaryAction={<Button variant="outline" nativeButton={false} render={<Link href="/marketplace" />}>Explore Marketplace</Button>} />
        </div>
      )}
      {result.total > result.pageSize && <MarketplacePagination {...result} itemLabel="template" prefetch={false} href={page => `/templates?page=${page}`} />}
    </section>
  );
}
