"use client";

import { useId, useState } from "react";
import { Coins, CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calculateCreditPurchase, CreditPricingError, parseCreditPaymentAmount, usdMinor, type CreditPurchasePricing } from "@/lib/payments/credit-pricing";
import { AppNotification } from "@/components/notifications/app-notification";


export function CustomCreditPurchase({ pricing, disabled, onCheckout, presentation = "default" }: {
  pricing: CreditPurchasePricing;
  disabled: boolean;
  onCheckout: (amountUsd: string) => void;
  presentation?: "default" | "billing";
}) {
  const id = useId();
  const [amount, setAmount] = useState("");
  let quote = null;
  let error = "";
  if (amount) {
    try { quote = calculateCreditPurchase(parseCreditPaymentAmount(amount), pricing); }
    catch (failure) { error = failure instanceof CreditPricingError ? failure.message : "Credit pricing is unavailable."; }
  }
  if (presentation === "billing") return <form aria-label="Custom credit purchase" className="grid min-w-0 gap-4 rounded-[14px] border border-border bg-card px-5 py-4 @min-[900px]/billing:px-6" onSubmit={event => {
    event.preventDefault();
    if (quote && !disabled) onCheckout((quote.amountMinor / 100).toFixed(2));
  }}>
    <div className="flex items-center gap-3"><Coins className="size-5 shrink-0 text-primary" aria-hidden="true" /><h2>Buy credits</h2></div>
    <div className="grid min-w-0 gap-4 @min-[640px]/billing:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] @min-[640px]/billing:gap-x-9">
      <div className="grid min-w-0 content-center gap-2">
        <label htmlFor={id} className="text-[13px] font-medium">Payment amount (USD)</label>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" placeholder="10.00" value={amount} disabled={disabled}
          className="h-10 w-full min-w-0 rounded-lg border border-border bg-muted/40 px-3 text-[14px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:min-h-11"
          aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={event => setAmount(event.target.value)} />
        <span id={`${id}-help`} className="sr-only">Up to $1,000.00 USD, with at most two decimal places. Fees are rounded to cents and credits down to whole numbers.</span>
        {error && <AppNotification id={`${id}-error`} role="status" className="text-xs text-destructive">{error}</AppNotification>}
      </div>
      <dl className="grid min-w-0 content-center gap-1.5 text-[13px] leading-5" aria-live="polite" aria-atomic="true">
        <div className="flex flex-wrap justify-between gap-x-3"><dt title="Estimated PayPal processing fee">Payment fee ({pricing.paypalBasisPoints / 100}% + {usdMinor(pricing.paypalFixedMinor)})</dt><dd className="tabular-nums">{quote ? usdMinor(quote.paypalFeeMinor) : "—"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-3"><dt title="Separate from Marketplace fees">Platform fee ({pricing.commissionBasisPoints / 100}%)</dt><dd className="tabular-nums">{quote ? usdMinor(quote.commissionMinor) : "—"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-3 border-t border-border pt-1.5 font-semibold"><dt>Total</dt><dd className="tabular-nums">{quote ? usdMinor(quote.amountMinor) : "—"}</dd></div>
      </dl>
    </div>
    <div className="grid min-w-0 gap-3 @min-[640px]/billing:grid-cols-[minmax(0,1fr)_minmax(200px,0.4fr)] @min-[640px]/billing:gap-6">
      <div className="flex min-h-10 min-w-0 flex-wrap items-center justify-between gap-x-3 rounded-lg bg-primary/[0.07] px-3.5 py-2 font-semibold text-primary" aria-live="polite" aria-atomic="true"><span className="text-[13px]">You receive</span><span className="text-[18px] leading-6 tabular-nums">{quote ? `${quote.credits.toLocaleString()} credits` : "—"}</span></div>
      <Button type="submit" disabled={disabled || !quote} className="h-auto min-h-10 w-full gap-2 rounded-lg px-4 py-2 text-[14px] font-semibold whitespace-normal shadow-none [@media(pointer:coarse)]:min-h-11"><CreditCard className="size-4 shrink-0" aria-hidden="true" />Pay {quote ? usdMinor(quote.amountMinor) : "$—"}</Button>
    </div>
    <span className="text-[11px] leading-4 text-muted-foreground">Review your payment total and credits before continuing to PayPal.</span>
  </form>;
  return <form aria-label="Custom credit purchase" className="grid min-w-0 gap-4 rounded-[14px] border border-border bg-card px-5 py-4 text-sm" onSubmit={event => {
    event.preventDefault();
    if (quote && !disabled) onCheckout((quote.amountMinor / 100).toFixed(2));
  }}>
    <div className="flex items-center gap-3"><Coins className="size-5 shrink-0 text-primary" aria-hidden="true" /><h2 className="font-semibold">Buy credits</h2></div>
    <p className="text-muted-foreground">Choose your payment amount. 100 Sceenyk credits cover $1 of generation cost. Purchased credits do not expire.</p>
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      <div className="grid min-w-0 content-start gap-2">
        <label htmlFor={id} className="font-medium">Payment amount (USD)</label>
        <input id={id} type="text" inputMode="decimal" autoComplete="off" placeholder="5.00" value={amount} disabled={disabled}
          className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
          aria-invalid={!!error} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={event => setAmount(event.target.value)} />
        <p id={`${id}-help`} className="text-xs text-muted-foreground">Enter up to $1,000.00 with no more than two decimal places.</p>
        {error && <AppNotification id={`${id}-error`} role="status" className="text-xs text-destructive">{error}</AppNotification>}
      </div>
      <dl className="grid min-w-0 gap-2 text-xs" aria-live="polite" aria-atomic="true">
        <div className="flex flex-wrap justify-between gap-x-3"><dt>Estimated PayPal fee ({pricing.paypalBasisPoints / 100}% + {usdMinor(pricing.paypalFixedMinor)})</dt><dd className="tabular-nums">{quote ? usdMinor(quote.paypalFeeMinor) : "—"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-3"><dt>Sceenyk commission ({pricing.commissionBasisPoints / 100}%)</dt><dd className="tabular-nums">{quote ? usdMinor(quote.commissionMinor) : "—"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-3"><dt>For generation</dt><dd className="tabular-nums">{quote ? usdMinor(quote.generationMinor) : "—"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-3 border-t border-border pt-2 font-semibold"><dt>You receive</dt><dd className="text-primary tabular-nums">{quote ? `${quote.credits.toLocaleString()} credits` : "—"}</dd></div>
        <div className="flex flex-wrap justify-between gap-x-3 font-semibold"><dt>Payment total</dt><dd className="tabular-nums">{quote ? `${usdMinor(quote.amountMinor)} USD` : "—"}</dd></div>
      </dl>
    </div>
    <p className="text-xs text-muted-foreground">Fees are rounded to cents and credits down to whole numbers. PayPal fees are estimates; your reviewed credit amount is fixed for this purchase. This payment commission is separate from Marketplace fees.</p>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-prose text-xs text-muted-foreground">Review your payment total and credits before continuing to PayPal.</p>
      <Button type="submit" disabled={disabled || !quote} className="h-auto min-h-9 whitespace-normal shadow-none">Pay {quote ? `${usdMinor(quote.amountMinor)} USD` : "with PayPal"}<ExternalLink className="size-3.5 shrink-0" aria-hidden="true" /></Button>
    </div>
  </form>;
}
