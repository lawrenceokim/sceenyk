import Link from "next/link";
import { FileText, Film, Info, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatorAvatar } from "@/components/marketplace/creator-avatar";
import { usd } from "@/lib/marketplace/payments/contract";
import {
  acquisitionDate,
  type Acquisition,
} from "@/lib/marketplace/purchases/contract";
import { CreateVersionButton } from "./create-version-button";
import { PurchasePreview } from "./purchase-preview";
import { PurchaseStatus } from "./purchases-library";
import { PurchasesBack } from "./purchases-states";

export function PurchaseDetail({ purchase }: { purchase: Acquisition }) {
  const template = purchase.template,
    settings = template.settings;
  const fields = [
    ["Format", settings.aspectRatio],
    ["Duration", `${settings.duration} seconds`],
    ["Style", settings.visualStyle],
    ["Tone", settings.tone],
    ...(settings.resolution ? [["Resolution", settings.resolution]] : []),
    ...(template.creationType
      ? [
          [
            "Creation type",
            template.creationType === "ugc" ? "UGC" : "Freestyle",
          ],
        ]
      : []),
    ...(template.creationType === "ugc" && template.ugcType
      ? [["Type", template.ugcType]]
      : []),
  ];
  return (
    <div className="@container/purchase-detail min-w-0 space-y-5">
      <PurchasesBack />
      <div className="grid min-w-0 items-start gap-7 @min-[850px]/purchase-detail:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] @min-[1100px]/purchase-detail:gap-9">
        <PurchasePreview
          key={purchase.previewUrl}
          url={purchase.previewUrl}
          title={purchase.title}
          large
        />
        <div className="min-w-0 space-y-4 text-xs leading-5">
          <div className="space-y-2">
            <h1 className="[&&&&]:text-[26px] [&&&&]:leading-8 font-semibold break-words">
              {purchase.title}
            </h1>
            <p className="text-sm leading-6 whitespace-pre-wrap text-muted-foreground [overflow-wrap:anywhere]">
              {purchase.description}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium">
                {settings.visualStyle}
              </span>
              <PurchaseStatus purchase={purchase} />
            </div>
          </div>
          <div className="flex items-center gap-2 [&_.rounded-full]:size-7 [&_.rounded-full]:text-xs">
            <CreatorAvatar
              name={purchase.creatorName}
              url={purchase.creatorAvatar}
            />
            {purchase.creatorSlug ? (
              <Link
                href={`/marketplace/creators/${purchase.creatorSlug}`}
                className="rounded-sm outline-none hover:text-link focus-visible:ring-2 focus-visible:ring-ring"
              >
                By {purchase.creatorName}
              </Link>
            ) : (
              <span>By {purchase.creatorName}</span>
            )}
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5">
            <dt className="text-muted-foreground">Purchase price</dt>
            <dd className="font-semibold">
              {purchase.kind === "free"
                ? "Free"
                : `${usd(purchase.amountMinor)} USD`}
            </dd>
            <dt className="text-muted-foreground">Generation cost</dt>
            <dd className="font-semibold">Review in your project</dd>
            <dt className="text-muted-foreground">Acquired</dt>
            <dd>
              <time dateTime={purchase.acquiredAt}>
                {acquisitionDate(purchase.acquiredAt)}
              </time>
            </dd>
          </dl>
          <div className="grid gap-2">
            <CreateVersionButton id={purchase.id} title={purchase.title} />
            {purchase.listingAvailable ? (
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link href={`/marketplace/${purchase.listingId}`} />}
                className="h-auto min-h-10 w-full rounded-lg px-3 py-2 text-sm [@media(pointer:coarse)]:min-h-11"
              >
                View in Marketplace
              </Button>
            ) : (
              <p className="text-muted-foreground">
                This template is no longer listed. Your acquired template is
                still available.
              </p>
            )}
          </div>
          <section
            className="space-y-3 border-t border-border pt-4"
            aria-labelledby="purchase-settings"
          >
            <h2
              id="purchase-settings"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <Layers3 aria-hidden="true" className="size-4 text-primary" />
              What you’ll use
            </h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 @min-[850px]/purchase-detail:grid-cols-1 @min-[1080px]/purchase-detail:grid-cols-2">
              {fields.map(([label, value]) => (
                <div key={label} className="flex min-w-0 justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="text-right font-semibold capitalize [overflow-wrap:anywhere]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
          <section
            className="space-y-2 border-t border-border pt-4"
            aria-labelledby="purchase-prompt"
          >
            <h2
              id="purchase-prompt"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <FileText aria-hidden="true" className="size-4 text-primary" />
              Original prompt & instructions
            </h2>
            <p className="rounded-xl border border-border bg-muted/60 px-3 py-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
              {template.instructions}
            </p>
          </section>
          <section className="space-y-2" aria-labelledby="purchase-storyboard">
            <h2
              id="purchase-storyboard"
              className="flex items-center gap-2 text-sm font-semibold"
            >
              <Film aria-hidden="true" className="size-4 text-primary" />
              Storyboard
            </h2>
            <p className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-muted-foreground">
              No storyboard was shared with this template. Create your own in
              your project.
            </p>
          </section>
          <p className="flex items-start gap-2 pt-1 text-[11px] leading-5 text-muted-foreground">
            <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Use your own characters, products, media and prompts. AI
              generation is separate; review usage and credits in your project.
              Existing project approvals still apply.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
