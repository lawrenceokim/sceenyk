import Link from "next/link";
import {
  Check,
  Clock3,
  Gift,
  Layers3,
  ShoppingBag,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { CreatorAvatar } from "@/components/marketplace/creator-avatar";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import { usd } from "@/lib/marketplace/payments/contract";
import {
  acquisitionDate,
  type Acquisition,
  type AcquisitionPage,
} from "@/lib/marketplace/purchases/contract";
import { CreateVersionButton } from "./create-version-button";
import { PurchasePreview } from "./purchase-preview";
import { memo, type Ref } from "react";
import { ListingVideoPreview } from "@/components/marketplace/listing-video-preview";
import type { PreviewMediaSource } from "@/components/marketplace/gallery-cache";
import type { PurchaseGalleryCard } from "@/lib/purchases/gallery-contract";

export function PurchaseStatus({ purchase }: { purchase: Acquisition }) {
  const free = purchase.kind === "free";
  const label =
    purchase.financialStatus === "refunded"
      ? "Refunded"
      : purchase.financialStatus === "partially_refunded"
        ? "Partially refunded"
        : free
          ? "Free"
          : "Purchased";
  const Icon = free ? Gift : Check;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-4 font-semibold ${free ? "bg-success-surface text-success-foreground" : "bg-primary/85 text-primary-foreground"}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
const CachedPurchaseCard = memo(PurchaseCard);
export function PurchasesLibrary({ result, previews, previewSource, galleryRef }: {
  result: AcquisitionPage; previews?: Record<string, PurchaseGalleryCard>; previewSource?: PreviewMediaSource; galleryRef?: Ref<HTMLElement>;
}) {
  return (
    <section
      ref={galleryRef}
      className="@container/purchase-library min-w-0 space-y-7"
      aria-label="Your acquired templates"
    >
      {result.items.length ? (
        <ul className="grid max-w-[1060px] grid-cols-1 items-start gap-5 @min-[560px]/purchase-library:grid-cols-2 @min-[920px]/purchase-library:grid-cols-3">
          {result.items.map((purchase) => (
            <li key={purchase.id} className="min-w-0">
              <CachedPurchaseCard purchase={purchase} preview={previews?.[purchase.id]} previewSource={previewSource} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-border">
          <EmptyState
            icon={<ShoppingBag className="size-7" />}
            title={
              result.total ? "No purchases on this page" : "No purchases yet"
            }
            description={
              result.total
                ? "Return to your latest acquired templates."
                : "Free and purchased Marketplace templates will appear here."
            }
            primaryAction={
              <Button
                nativeButton={false}
                render={
                  <Link href={result.total ? "/purchases" : "/marketplace"} />
                }
              >
                {result.total ? "Latest purchases" : "Browse Marketplace"}
              </Button>
            }
          />
        </div>
      )}
      {result.total > result.pageSize && (
        <MarketplacePagination
          {...result}
          itemLabel="purchase"
          prefetch={false}
          href={(page) => `/purchases?page=${page}`}
        />
      )}
    </section>
  );
}
function PurchaseCard({ purchase, preview, previewSource }: { purchase: Acquisition; preview?: PurchaseGalleryCard; previewSource?: PreviewMediaSource }) {
  const settings = purchase.template.settings;
  const href = `/purchases/${purchase.id}`;
  return (
    <article className="relative min-w-0 rounded-[14px] border border-border bg-linear-to-b from-muted to-card p-2.5 text-card-foreground transition-colors hover:border-primary/40 has-[.purchase-open:focus-visible]:outline-2 has-[.purchase-open:focus-visible]:outline-offset-3 has-[.purchase-open:focus-visible]:outline-ring">
      <Link
        href={href}
        className="purchase-open block outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-['']"
        aria-label={`Open purchase ${purchase.title}`}
      >
        <div className="relative">
          {preview && previewSource ? <div className="overflow-hidden rounded-lg"><ListingVideoPreview listingId={purchase.id} version={preview.videoVersion}
            source={previewSource} posterUrl={purchase.previewUrl}
            staticFallback={<PurchasePreview url={purchase.previewUrl} title={purchase.title} />}>
            <PurchasePreview url={null} title={purchase.title} />
          </ListingVideoPreview></div> : <PurchasePreview
            key={purchase.previewUrl}
            url={purchase.previewUrl}
            title={purchase.title}
          />}
          <div className="absolute top-2 left-2">
            <PurchaseStatus purchase={purchase} />
          </div>
        </div>
        <div className="space-y-2 px-1 pt-2.5">
          <h2 className="text-base leading-6 font-semibold break-words">
            {purchase.title}
          </h2>
          <p className="text-xs text-muted-foreground">
            Acquired{" "}
            <time dateTime={purchase.acquiredAt}>
              {acquisitionDate(purchase.acquiredAt)}
            </time>
          </p>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground [&_.rounded-full]:size-6 [&_.rounded-full]:text-xs">
              <CreatorAvatar
                name={purchase.creatorName}
                url={purchase.creatorAvatar}
              />
              <span className="truncate">By {purchase.creatorName}</span>
            </span>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${purchase.kind === "free" ? "bg-success-surface text-success-foreground" : "bg-primary/20 text-foreground"}`}
            >
              {purchase.kind === "free" ? "Free" : usd(purchase.amountMinor)}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1 text-[10px] text-foreground [&>span]:inline-flex [&>span]:items-center [&>span]:gap-1 [&>span]:rounded-full [&>span]:bg-foreground/5 [&>span]:px-2 [&>span]:py-1 [&_svg]:size-3.5">
            <span>
              <Video aria-hidden="true" />
              {settings.aspectRatio}
            </span>
            <span>
              <Clock3 aria-hidden="true" />
              {settings.duration} seconds
            </span>
            <span>
              <Layers3 aria-hidden="true" />
              {settings.visualStyle}
            </span>
          </div>
        </div>
      </Link>
      <footer className="relative z-10 mx-1 mt-4 border-t border-border pt-3">
        <CreateVersionButton id={purchase.id} title={purchase.title} label="Adopt template" />
      </footer>
    </article>
  );
}
