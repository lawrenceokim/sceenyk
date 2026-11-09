import type { ReactNode } from "react";
import Image from "next/image";
import { Coins, ExternalLink, Gift, Layers, RefreshCw, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FreeAllowanceSummary } from "@/components/free-allowance";
import type { CreditPack, CreditWallet, PurchaseStatus } from "@/lib/payments/types";
import { FinancialRowsSkeleton } from "./financial-skeletons";

type Props = {
  packs: CreditPack[];
  wallet: CreditWallet | null;
  walletLoaded: boolean;
  busy: boolean;
  configured: boolean;
  notices: ReactNode;
  statusCopy: Record<PurchaseStatus, string>;
  onCheckPurchases: () => void;
  onCheckout: (packId: string) => void;
  onCancelCheckout: (orderId: string) => void;
};

const card = "min-w-0 rounded-[14px] border border-border bg-card";
const activityCopy = { purchase: "Credits purchased", reservation: "Generation reservation", consumption: "Generation completed", release: "Reservation restored" };

// Presentation only: the existing purchase account owns all payment actions and state.
export function CreditBillingDashboard({ packs, wallet, walletLoaded, busy, configured, notices, statusCopy, onCheckPurchases, onCheckout, onCancelCheckout }: Props) {
  return <div aria-busy={busy} className="@container/billing grid min-w-0 gap-5 text-[13px] leading-5 text-foreground [&&&_p]:text-[13px] [&&&_p]:leading-5 [&&&_h2]:text-[13px] [&&&_h2]:leading-5 [&&&_h2]:font-semibold [&&&_ul]:pl-0 [&&&_li+li]:mt-0 [&&&_section>*+*]:mt-0 [&&&_[data-slot=button]]:min-h-7 [&&&_[data-slot=button]]:rounded-md [&&&_[data-slot=button]]:px-2 [&&&_[data-slot=button]]:py-1 [&&&_[data-slot=button]]:text-[11px] [&&&_[data-slot=button]]:leading-[18px] [&&&_[data-slot=button]_svg]:size-3.5 [@media(pointer:coarse)]:[&&&_[data-slot=button]]:min-h-11">
    <section aria-label="Credit balance and free allowance" className="relative isolate min-w-0 overflow-hidden rounded-[14px] border border-primary/25 bg-linear-to-r from-primary/[0.025] to-primary/[0.06] px-5 py-5 @min-[960px]/billing:pr-44">
      <div aria-hidden="true" className="pointer-events-none absolute -right-14 -bottom-32 -z-10 size-52 rounded-full bg-primary/[0.035]" />
      <Image src="/images/billing/credits-wallet.png" alt="" aria-hidden="true" width={480} height={320} sizes="176px" className="pointer-events-none absolute right-3 bottom-0 hidden h-auto w-44 object-contain opacity-65 @min-[960px]/billing:block" />
      <dl className="grid min-w-0 grid-cols-1 gap-4 @min-[340px]/billing:grid-cols-2 @min-[760px]/billing:grid-cols-[1.2fr_1fr_1.08fr_1.2fr] @min-[760px]/billing:gap-0">
        <div className="flex min-w-0 items-center gap-3 @min-[760px]/billing:pr-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[18px] bg-primary/[0.07] text-primary"><Coins className="size-5" aria-hidden="true" /></span>
          <div className="grid min-w-0 gap-1"><dt className="text-xs leading-[18px] text-muted-foreground">Available paid credits</dt><dd className="[&&&&]:text-lg [&&&&]:leading-6 font-semibold tabular-nums text-link">{wallet ? wallet.available.toLocaleString() : walletLoaded ? "—" : <Skeleton className="h-7 w-20" />}</dd></div>
        </div>
        <div className="grid min-w-0 content-center gap-1 @min-[760px]/billing:border-l @min-[760px]/billing:border-primary/20 @min-[760px]/billing:px-5"><dt className="text-xs leading-[18px] text-muted-foreground">Reserved in progress</dt><dd className="[&&&&]:text-lg [&&&&]:leading-6 font-semibold tabular-nums">{wallet ? wallet.reserved.toLocaleString() : walletLoaded ? "—" : <Skeleton className="h-7 w-12" />}</dd></div>
        <div className="grid min-w-0 content-center gap-1 @min-[760px]/billing:border-l @min-[760px]/billing:border-primary/20 @min-[760px]/billing:px-5"><dt className="text-xs leading-[18px] text-muted-foreground">Free generations remaining</dt><dd><FreeAllowanceSummary presentation="billing-balance" /></dd></div>
        <div className="grid min-w-0 content-center gap-1 @min-[760px]/billing:border-l @min-[760px]/billing:border-primary/20 @min-[760px]/billing:pl-5"><dt className="text-xs leading-[18px] text-muted-foreground">Free generation limit</dt><dd className="[&&&&]:text-base [&&&&]:leading-6 font-semibold">5 sec, 480p each</dd></div>
      </dl>
    </section>

    {notices}

    <section aria-label="Sandbox demo credit packs" className="grid min-w-0 gap-4 @min-[680px]/billing:grid-cols-3">
      {packs.map(pack => <article key={pack.id} className={`${card} flex flex-col gap-3 px-5 py-4 @min-[1000px]/billing:px-6`}>
        <span className="w-fit rounded-full bg-accent px-3 py-1 text-[11px] leading-[17px] font-medium text-link">Sandbox test pack</span>
        <div className="flex items-center gap-3"><Coins className="size-5 shrink-0 text-primary" aria-hidden="true" /><h2>{pack.name}</h2></div>
        <div className="grid gap-0.5">
          <div className="text-lg leading-6 font-semibold tabular-nums">{pack.credits.toLocaleString()} <span className="text-[13px] font-normal">credits</span></div>
          <div className="text-[13px] leading-5 font-semibold">${pack.amount} {pack.currency} <span className="text-xs font-normal text-muted-foreground">test funds</span></div>
          <p className="pt-1 text-muted-foreground">One-time Sandbox purchase. Temporary demo values. Credits stay available until you use them.</p>
        </div>
        <Button className="mt-auto w-full whitespace-normal shadow-none" disabled={!configured || busy || !wallet} onClick={() => onCheckout(pack.id)}>Pay with PayPal Sandbox <ExternalLink aria-hidden="true" /></Button>
      </article>)}
    </section>

    <div className="grid min-w-0 items-start gap-4 @min-[800px]/billing:grid-cols-[1fr_1.05fr]">
      <section className={`${card} grid gap-3 px-5 py-4`} aria-labelledby="purchases-heading">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3"><ShoppingCart className="size-5 shrink-0 text-primary" aria-hidden="true" /><h2 id="purchases-heading">Recent purchases</h2></div>
          <Button variant="ghost" size="icon-xs" disabled={busy} onClick={onCheckPurchases} aria-label={busy ? "Checking payment…" : "Check purchases"} title={busy ? "Checking payment…" : "Check purchases"}><RefreshCw className={busy ? "motion-safe:animate-spin" : ""} aria-hidden="true" /></Button>
        </div>
        {!wallet ? walletLoaded ? <p className="text-muted-foreground">Saved purchases are unavailable. Check purchases to try again.</p> : <FinancialRowsSkeleton /> : !wallet.purchases.length ? <p className="py-3 text-muted-foreground">No credit purchases yet.</p> : <ul className="list-none divide-y divide-border">
          {wallet.purchases.map((purchase, index) => <li key={purchase.orderId ?? `${purchase.created_at}-${index}`} className="grid gap-0.5 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs leading-[18px] font-semibold"><span>{purchase.pack_name} · {purchase.credits.toLocaleString()} credits</span><span>${purchase.amount} {purchase.currency} · {purchase.status}</span></div>
            <span className="text-[11px] leading-[17px] text-muted-foreground">{statusCopy[purchase.status]}</span>
            <time className="text-[11px] leading-[17px] text-muted-foreground" dateTime={purchase.created_at}>{new Date(purchase.created_at).toLocaleString()}</time>
            {purchase.status === "pending" && <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" disabled={busy || !configured || !packs.some(pack => pack.id === purchase.pack_id)} onClick={() => onCheckout(purchase.pack_id)}>Continue checkout</Button>
              {purchase.orderId && <Button variant="ghost" disabled={busy || !configured} onClick={() => onCancelCheckout(purchase.orderId!)}>Cancel checkout</Button>}
            </div>}
          </li>)}
        </ul>}
      </section>
      <section className={`${card} grid gap-2 px-5 py-4`} aria-labelledby="credit-activity-heading">
        <div className="flex min-h-7 items-center gap-3"><Layers className="size-5 shrink-0 text-primary" aria-hidden="true" /><h2 id="credit-activity-heading">Paid credit activity</h2></div>
        <p className="text-muted-foreground">Last 20 paid credit movements. Completion spends credits already reserved; it does not deduct them twice.</p>
        {!wallet ? walletLoaded ? <p className="text-muted-foreground">Credit activity is unavailable. Check purchases to try again.</p> : <FinancialRowsSkeleton /> : !wallet.activity.length ? <p className="py-3 text-muted-foreground">No paid credit activity yet.</p> : <ul className="list-none divide-y divide-border">
          {wallet.activity.map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3 last:pb-0">
            <div className="grid gap-0.5"><span className="text-xs leading-[18px] font-semibold">{activityCopy[entry.type]}</span><time className="text-[11px] leading-[17px] text-muted-foreground" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></div>
            <span className="text-xs leading-[18px] font-semibold tabular-nums">{entry.type === "consumption" ? `${entry.amount.toLocaleString()} reserved credits used` : `${entry.availableDelta > 0 ? "+" : ""}${entry.availableDelta.toLocaleString()} available credits`}</span>
          </li>)}
        </ul>}
      </section>
    </div>

    <section className={`${card} flex items-start gap-5 px-5 py-4 @min-[500px]/billing:items-center`} aria-label="Free generation allowance">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-[18px] bg-primary/[0.07] text-primary"><Gift className="size-6" aria-hidden="true" /></span>
      <div className="grid min-w-0 gap-1"><h2>Your free allowance stays separate</h2><FreeAllowanceSummary presentation="billing-footer" /><p className="text-muted-foreground">Each free generation is limited to 5 seconds at 480p. Free usage stays separate from purchased credits and does not reduce your paid credit balance.</p></div>
    </section>
  </div>;
}
