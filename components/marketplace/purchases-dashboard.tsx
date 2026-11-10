"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Menu } from "@base-ui/react/menu";
import { ArrowRight, CalendarDays, CheckCircle2, Clock3, Ellipsis, ExternalLink, Folder, ImageIcon, Info, LoaderCircle, ReceiptText, RefreshCw, ShoppingCart, Store, Tag, TriangleAlert, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { popupMotion } from "@/components/ui/motion";
import { usd, type MarketplacePurchaseSummary } from "@/lib/marketplace/payments/contract";
import { AbstractPreview } from "./abstract-preview";
import { MarketplacePagination } from "./pagination";

type Props = {
  purchases?: { items: MarketplacePurchaseSummary[]; total: number };
  previews?: Record<string, ReactNode>;
  page: number;
  busy: boolean;
  error: string;
  message: string;
  onRefresh: () => Promise<void>;
  onContinueCheckout: (purchase: MarketplacePurchaseSummary) => Promise<void>;
};

const statusPresentation = {
  completed: { label: "Completed", icon: CheckCircle2, className: "border-success-foreground/20 bg-success-surface text-success-foreground" },
  pending: { label: "Pending", icon: Clock3, className: "border-warning-foreground/20 bg-warning-surface text-warning-foreground" },
  approved: { label: "Approved", icon: Clock3, className: "border-primary/25 bg-primary/10 text-primary" },
  failed: { label: "Failed", icon: TriangleAlert, className: "border-destructive/20 bg-destructive-surface text-destructive" },
  partially_refunded: { label: "Partially refunded", icon: Undo2, className: "border-warning-foreground/20 bg-warning-surface text-warning-foreground" },
  refunded: { label: "Refunded", icon: Undo2, className: "border-border bg-muted text-muted-foreground" },
};

function purchaseDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(date);
}

export function PurchasesDashboard({ purchases, previews = {}, page, busy, error, message, onRefresh, onContinueCheckout }: Props) {
  const [previewed, setPreviewed] = useState<MarketplacePurchaseSummary | null>(null);
  const preview = (purchase: MarketplacePurchaseSummary) => previews[purchase.listingId] ?? <AbstractPreview previewId={purchase.listingId} label={purchase.title} ariaLabel="Abstract template placeholder; not purchased media" />;

  return <div className="@container/purchases min-w-0 space-y-6 text-[13px] leading-5 sm:space-y-7">
    <div className="flex flex-col items-start gap-3 @min-[650px]/purchases:flex-row @min-[650px]/purchases:items-center @min-[650px]/purchases:gap-5">
      <Button variant="outline" className="h-auto min-h-10 shrink-0 gap-2 rounded-lg border-primary/35 bg-linear-to-b from-primary/25 to-primary/10 px-4 py-2 text-[13px] font-semibold hover:bg-primary/20 [@media(pointer:coarse)]:min-h-11" disabled={busy} onClick={() => void onRefresh()}>
        {busy ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : <ShoppingCart aria-hidden="true" className="size-4" />}
        {busy ? "Checking…" : "Check purchases"}
      </Button>
      <p className="flex min-w-0 items-start gap-2.5 text-xs leading-5 text-muted-foreground @min-[650px]/purchases:border-l @min-[650px]/purchases:border-border @min-[650px]/purchases:pl-5"><Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />Template purchases don’t include AI credits or generation usage.</p>
    </div>
    {(error || message) && <p role={error ? "alert" : "status"} className={`rounded-xl border p-3 text-xs leading-5 ${error ? "border-destructive/20 bg-destructive-surface text-destructive" : "border-primary/20 bg-primary/5 text-muted-foreground"}`}>{error || message}</p>}

    <div className="space-y-4" aria-busy={busy}>
      {purchases?.items.map(purchase => {
        const status = statusPresentation[purchase.financialStatus], StatusIcon = status.icon;
        return <article key={purchase.id} aria-label={purchase.title} className="relative isolate grid min-w-0 gap-5 overflow-hidden rounded-[18px] border border-primary/30 bg-card p-4 [background-image:radial-gradient(ellipse_at_top_right,color-mix(in_srgb,var(--primary)_15%,transparent),transparent_65%)] @min-[700px]/purchases:grid-cols-[minmax(0,0.9fr)_minmax(0,1.15fr)] @min-[700px]/purchases:gap-7 @min-[900px]/purchases:p-5">
          <div aria-hidden="true" className="pointer-events-none absolute -top-24 -right-10 -z-10 h-52 w-80 -rotate-45 rounded-[50%] bg-primary/[0.06]" />
          <button type="button" onClick={() => setPreviewed(purchase)} aria-label={`View preview for ${purchase.title}`} className="relative block aspect-video min-w-0 overflow-hidden rounded-[13px] border border-primary/20 bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div]:h-full [&>div]:min-h-0 [&>div]:w-full [&_img]:object-cover">
            {preview(purchase)}
            <span className="absolute right-2.5 bottom-2.5 flex size-8 items-center justify-center rounded-lg border border-white/20 bg-black/45 text-white backdrop-blur-sm"><ImageIcon aria-hidden="true" className="size-4" /></span>
          </button>
          <div className="flex min-w-0 flex-col justify-center gap-4 py-1 @min-[900px]/purchases:gap-5">
            <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
              <h2 className="min-w-0 break-words text-lg leading-7 font-semibold tracking-tight @min-[900px]/purchases:text-[22px]">{purchase.title}</h2>
              <span className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] leading-4 font-medium ${status.className}`}><StatusIcon aria-hidden="true" className="size-3.5 shrink-0" />{status.label}</span>
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
              <p className="flex items-center gap-2 text-sm font-medium"><Tag aria-hidden="true" className="size-4 text-muted-foreground" />{usd(purchase.amountMinor)} USD</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground sm:border-l sm:border-border sm:pl-5"><CalendarDays aria-hidden="true" className="size-4" /><time dateTime={purchase.createdAt}>{purchaseDate(purchase.createdAt)}</time></p>
            </div>
            {purchase.refundedMinor > 0 && <p className="text-xs leading-5 text-muted-foreground">Refunded: {usd(purchase.refundedMinor)}. Your adopted project remains available.</p>}
            <div className="flex min-w-0 items-start gap-3">
              <div className="min-w-0 flex-1">
                {purchase.projectId ? <Button nativeButton={false} render={<Link href={`/projects/${purchase.projectId}`} />} className="h-auto min-h-10 w-full justify-start gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold whitespace-normal [@media(pointer:coarse)]:min-h-11"><Folder aria-hidden="true" className="size-4 shrink-0" /><span className="flex-1 text-left">Open adopted project</span><ArrowRight aria-hidden="true" className="size-4 shrink-0" /></Button>
                  : purchase.status !== "failed" ? <Button variant="outline" disabled={busy} onClick={() => void onContinueCheckout(purchase)} className="h-auto min-h-10 w-full gap-2 rounded-lg px-3 py-2 text-[13px] whitespace-normal [@media(pointer:coarse)]:min-h-11"><RefreshCw aria-hidden="true" className="size-4 shrink-0" />{purchase.status === "completed" ? "Recover adopted project" : "Continue saved Sandbox checkout"}</Button>
                    : <p className="text-xs leading-5 text-muted-foreground">Payment failed. Reconciliation is required before another charge.</p>}
              </div>
              <Menu.Root>
                <Menu.Trigger render={<Button variant="outline" size="icon" className="size-10 shrink-0 rounded-lg border-primary/25 bg-transparent [@media(pointer:coarse)]:size-11" />} aria-label={`Actions for ${purchase.title}`}><Ellipsis aria-hidden="true" className="size-5" /></Menu.Trigger>
                <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-[70]">
                  <Menu.Popup className={`${popupMotion} min-w-48 max-w-[calc(100vw-2rem)] rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-popover outline-none`}>
                    <Menu.Item render={<Link href={`/marketplace/${purchase.listingId}`} />} className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs outline-none data-highlighted:bg-accent [@media(pointer:coarse)]:min-h-11"><ExternalLink aria-hidden="true" className="size-3.5" />View template</Menu.Item>
                    <Menu.Item disabled={busy} onClick={() => void onRefresh()} className="flex min-h-9 items-center gap-2 rounded-lg px-3 text-xs outline-none data-highlighted:bg-accent data-disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"><ReceiptText aria-hidden="true" className="size-3.5" />Check purchases</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner></Menu.Portal>
              </Menu.Root>
            </div>
          </div>
        </article>;
      })}
      {purchases && !purchases.items.length && <div className="grid justify-items-center gap-3 rounded-[18px] border border-primary/20 bg-primary/[0.025] px-5 py-12 text-center">
        <Store aria-hidden="true" className="size-8 text-primary" /><h2 className="text-base font-semibold">{purchases.total ? "No purchases on this page" : "No paid Marketplace purchases yet"}</h2>
        <p className="max-w-md text-xs leading-5 text-muted-foreground">{purchases.total ? "Return to your latest purchases to reopen an adopted project." : "Discover a creator template and make it your own."}</p>
        <Button variant="outline" nativeButton={false} render={<Link href={purchases.total ? "/marketplace/purchases" : "/marketplace"} />} className="h-auto min-h-9 px-3 py-2 text-xs [@media(pointer:coarse)]:min-h-11">{purchases.total ? "Latest purchases" : "Browse Marketplace"}</Button>
      </div>}
      {!purchases && <p role="status" className="rounded-xl border border-border p-5 text-xs text-muted-foreground">Saved purchases are unavailable. Check purchases to try again.</p>}
    </div>

    {purchases && <div className="flex min-w-0 items-center justify-center gap-5 pt-3 sm:pt-6">
      <span aria-hidden="true" className="hidden h-px flex-1 bg-border sm:block" />
      <div className="min-w-0 [&>nav]:gap-3 [&>nav]:pt-0 [&_span]:text-xs [&_[data-slot=button]]:h-auto [&_[data-slot=button]]:min-h-8 [&_[data-slot=button]]:px-3 [&_[data-slot=button]]:py-1 [&_[data-slot=button]]:text-xs [@media(pointer:coarse)]:[&_[data-slot=button]]:min-h-11"><MarketplacePagination page={page} total={purchases.total} pageSize={12} itemLabel="purchase" href={value => `/marketplace/purchases?page=${value}`} /></div>
      <span aria-hidden="true" className="hidden h-px flex-1 bg-border sm:block" />
    </div>}

    <Dialog open={!!previewed} onOpenChange={open => { if (!open) setPreviewed(null); }}>
      <DialogContent className="sm:max-w-2xl"><DialogTitle className="pr-8 text-lg">{previewed?.title}</DialogTitle><DialogDescription className="sr-only">Template preview for this Marketplace purchase.</DialogDescription>
        {previewed && <div className="aspect-video overflow-hidden rounded-xl bg-muted [&>div]:h-full [&>div]:w-full">{preview(previewed)}</div>}
      </DialogContent>
    </Dialog>
  </div>;
}
