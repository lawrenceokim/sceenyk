import type { ReactNode } from "react";
import Image from "next/image";
import { Coins, Gift, Layers, RefreshCw, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FreeAllowanceSummary } from "@/components/free-allowance";
import type { CreditWallet, PurchaseStatus } from "@/lib/payments/types";
import { FinancialRowsSkeleton } from "./financial-skeletons";

type Props = {
  purchaseForm: ReactNode;
  wallet: CreditWallet | null;
  walletLoaded: boolean;
  busy: boolean;
  configured: boolean;
  notices: ReactNode;
  statusCopy: Record<PurchaseStatus, string>;
  onCheckPurchases: () => void;
  onResumeCheckout: (purchaseId: string) => void;
  onCancelCheckout: (orderId: string) => void;
};

const card = "min-w-0 rounded-[14px] border border-border bg-card px-5 py-4 @min-[900px]/billing:px-6";
const activityCopy = { purchase: "Credits purchased", reservation: "Generation reservation", consumption: "Generation completed", release: "Reservation restored" };
const statusStyles: Record<PurchaseStatus, string> = {
  completed: "bg-success-surface text-success-foreground",
  cancelled: "bg-destructive-surface text-destructive",
  failed: "bg-destructive-surface text-destructive",
  pending: "bg-warning-surface text-warning-foreground",
  approved: "bg-info-surface text-info-foreground",
};

// Presentation only: the existing account owns payment actions and live state.
export function CreditBillingDashboard({ purchaseForm, wallet, walletLoaded, busy, configured, notices, statusCopy, onCheckPurchases, onResumeCheckout, onCancelCheckout }: Props) {
  return <div aria-busy={busy} className="@container/billing grid min-w-0 gap-4 text-[13px] leading-5 text-foreground [&&&_p]:text-[13px] [&&&_p]:leading-5 [&&&_h2]:text-[16px] [&&&_h2]:leading-[22px] [&&&_h2]:font-semibold [&&&_ul]:pl-0 [&&&_li+li]:mt-0 [&&&_section>*+*]:mt-0">
    <section aria-label="Credit balance and free allowance" className="relative isolate min-w-0 rounded-[14px] border border-primary/25 bg-primary/[0.035] px-5 py-5 @min-[880px]/billing:pr-48 @min-[900px]/billing:pl-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[14px]"><div className="absolute -right-12 -bottom-28 h-44 w-96 -rotate-12 rounded-[50%] bg-primary/[0.04]" /></div>
      <Image src="/images/billing/credits-wallet.png" alt="" aria-hidden="true" width={480} height={320} sizes="176px" className="pointer-events-none absolute right-4 bottom-0 hidden h-auto w-44 object-contain opacity-85 @min-[880px]/billing:block dark:opacity-90" />
      <dl className="grid min-w-0 gap-4 @min-[400px]/billing:grid-cols-2 @min-[640px]/billing:grid-cols-[1.15fr_1fr_1.3fr] @min-[640px]/billing:gap-0">
        <div className="flex min-w-0 items-center gap-3 @min-[640px]/billing:pr-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[18px] bg-primary/[0.07] text-primary"><Coins className="size-5" aria-hidden="true" /></span>
          <div className="grid min-w-0 gap-1"><dt className="text-[13px] text-muted-foreground">Available paid credits</dt><dd className="text-[22px] leading-7 font-semibold tabular-nums text-primary">{wallet ? wallet.available.toLocaleString() : walletLoaded ? "—" : <Skeleton className="h-7 w-20" />}</dd></div>
        </div>
        <div className="grid min-w-0 content-center gap-1 @min-[640px]/billing:border-l @min-[640px]/billing:border-primary/25 @min-[640px]/billing:px-5"><dt className="text-[13px] text-muted-foreground">Reserved in progress</dt><dd className="text-[22px] leading-7 font-semibold tabular-nums">{wallet ? wallet.reserved.toLocaleString() : walletLoaded ? "—" : <Skeleton className="h-7 w-12" />}</dd></div>
        <div className="grid min-w-0 content-center gap-1 @min-[640px]/billing:border-l @min-[640px]/billing:border-primary/25 @min-[640px]/billing:pl-5"><dt className="text-[13px] text-muted-foreground">Free generations remaining</dt><dd><FreeAllowanceSummary presentation="billing-balance" /></dd></div>
      </dl>
    </section>

    {notices}
    {purchaseForm}

    <div className="grid min-w-0 gap-4 @min-[760px]/billing:grid-cols-[1fr_1.05fr]">
      <section className={`${card} flex min-h-44 flex-col gap-4`} aria-labelledby="purchases-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3"><ShoppingCart className="size-5 shrink-0 text-primary" aria-hidden="true" /><h2 id="purchases-heading">Recent purchases</h2></div>
          <Button variant="ghost" size="icon-xs" disabled={busy} onClick={onCheckPurchases} aria-label={busy ? "Checking payment…" : "Check purchases"} title={busy ? "Checking payment…" : "Check purchases"} className="size-7 min-h-7 text-muted-foreground [@media(pointer:coarse)]:size-11"><RefreshCw className={`size-4 ${busy ? "motion-safe:animate-spin" : ""}`} aria-hidden="true" /></Button>
        </div>
        {!wallet ? walletLoaded ? <p className="text-muted-foreground">Purchases unavailable. Refresh to retry.</p> : <FinancialRowsSkeleton /> : !wallet.purchases.length ? <p className="py-3 text-muted-foreground">No credit purchases yet.</p> : <ul className="list-none divide-y divide-border">
          {wallet.purchases.map((purchase, index) => <li key={purchase.orderId ?? `${purchase.created_at}-${index}`} className="grid gap-1 py-2.5 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[13px] leading-5 font-semibold">{purchase.pack_name} · {purchase.credits.toLocaleString()} credits</span>
              <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] leading-5 font-semibold tabular-nums">${purchase.amount}<span className={`rounded-full px-1.5 py-0.5 text-[11px] leading-4 font-medium ${statusStyles[purchase.status]}`}>{purchase.status}</span></span>
            </div>
            <time className="text-[12px] leading-[18px] text-muted-foreground" dateTime={purchase.created_at}>{new Date(purchase.created_at).toLocaleString()}</time>
            <span className="sr-only">{statusCopy[purchase.status]}</span>
            {purchase.pricing && <details className="text-[12px] leading-[18px] text-muted-foreground"><summary className="w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-ring">Payment details</summary><div className="pt-1">Estimated payment fee ${(purchase.pricing.paypalFeeMinor / 100).toFixed(2)} · Platform fee ${(purchase.pricing.commissionMinor / 100).toFixed(2)}</div></details>}
            {purchase.status === "pending" && <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline" disabled={busy || !configured} onClick={() => onResumeCheckout(purchase.id)}>Continue checkout</Button>
              {purchase.orderId && <Button size="sm" variant="ghost" disabled={busy || !configured} onClick={() => onCancelCheckout(purchase.orderId!)}>Cancel checkout</Button>}
            </div>}
          </li>)}
        </ul>}
      </section>
      <section className={`${card} flex min-h-44 flex-col gap-4`} aria-labelledby="credit-activity-heading">
        <div className="flex min-h-7 items-center gap-3"><Layers className="size-5 shrink-0 text-primary" aria-hidden="true" /><h2 id="credit-activity-heading">Paid credit activity</h2></div>
        {!wallet ? walletLoaded ? <p className="text-muted-foreground">Activity unavailable. Refresh purchases to retry.</p> : <FinancialRowsSkeleton /> : !wallet.activity.length ? <p className="py-3 text-muted-foreground">No paid credit activity yet.</p> : <ul className="list-none divide-y divide-border">
          {wallet.activity.map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-2.5 first:pt-0 last:pb-0">
            <div className="grid gap-1"><span className="text-[13px] leading-5 font-semibold">{activityCopy[entry.type]}</span><time className="text-[12px] leading-[18px] text-muted-foreground" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></div>
            <span className={`text-[13px] leading-5 font-semibold tabular-nums ${entry.availableDelta > 0 ? "text-success-foreground" : "text-foreground"}`} title={entry.type === "consumption" ? "Spent from reserved credits" : "Change to available credits"}>{entry.type === "consumption" ? `−${entry.amount.toLocaleString()}` : `${entry.availableDelta > 0 ? "+" : ""}${entry.availableDelta.toLocaleString()}`} credits</span>
          </li>)}
        </ul>}
      </section>
    </div>

    <section className={`${card} flex items-start gap-4 @min-[500px]/billing:items-center`} aria-label="Free generation allowance" title="Each free generation is limited to 5 seconds at 480p">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[18px] bg-primary/[0.07] text-primary"><Gift className="size-6" aria-hidden="true" /></span>
      <div className="grid min-w-0 gap-1"><h2>Free allowance</h2><FreeAllowanceSummary presentation="billing-footer" /><p className="text-muted-foreground">Free usage stays separate from purchased credits.</p></div>
    </section>
  </div>;
}
