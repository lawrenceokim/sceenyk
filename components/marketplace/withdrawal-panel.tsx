"use client";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { payoutDestinationAction, withdrawalRequestAction } from "@/app/actions/creator-withdrawals";
import { usd } from "@/lib/marketplace/payments/contract";
import type { WithdrawalAccount } from "@/lib/marketplace/withdrawals/contract";
import { MarketplacePagination } from "./pagination";
import { Landmark, Mail, ReceiptText } from "lucide-react";
import { EarningsCard, EarningsEmptyState, EarningsIcon, PayPalMark } from "./earnings-ui";

export function WithdrawalPanel({ account, page, clerkUserId, onChanged, marketplaceSales }: { account: WithdrawalAccount; page: number; clerkUserId: string; onChanged: () => Promise<void>; marketplaceSales: ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState(account.email ?? "");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const inFlight = useRef(false);
  // Retain the exact key/payload through uncertain responses and browser closure.
  // This contains no payout address; the storage key scopes the form to identity.
  const request = useRef<{ requestId: string; amountMinor: number } | null>(null);
  async function submit(destination: boolean) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      if (destination) {
        const result = await payoutDestinationAction({ email: email.trim() });
        setMessage(result.ok ? "Private payout email saved. Existing withdrawals keep their original destination." : result.message);
        if (result.ok) { await onChanged(); router.refresh(); }
      } else {
        if (!/^\d+(\.\d{1,2})?$/.test(amount)) { setMessage("Enter a USD amount with up to two decimal places."); return; }
        const [whole, fraction = ""] = amount.split(".");
        const amountMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
        if (!Number.isSafeInteger(amountMinor) || amountMinor < 500 || amountMinor > account.available) { setMessage("Choose an amount from $5 up to your available earnings."); return; }
        const key = `sceenyk-withdrawal:${clerkUserId}`;
        if (!request.current) {
          try {
            const saved = JSON.parse(localStorage.getItem(key) ?? "null");
            if (saved && typeof saved.requestId === "string" && saved.amountMinor === amountMinor) request.current = saved;
          } catch { /* The server still enforces the authoritative balance. */ }
        }
        if (request.current && request.current.amountMinor !== amountMinor) { setMessage("Refresh your withdrawal history to resolve the previous request before changing its amount."); return; }
        request.current ??= { requestId: crypto.randomUUID(), amountMinor };
        try { localStorage.setItem(key, JSON.stringify(request.current)); } catch { /* In-memory retries retain the key. */ }
        const result = await withdrawalRequestAction(request.current);
        setMessage(result.ok ? "Withdrawal reserved. Withdrawals are held for 7 days before payout." : result.message);
        if (result.ok) {
          setConfirmed(true);
          // Keep the successful key while the current form remains mounted to
          // make a repeated click return the same withdrawal, not a second one.
          await onChanged(); router.refresh();
        }
      }
    } catch { setMessage("The result is uncertain. Refresh your history, then retry the same amount to recover the saved request."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <>
    {account.deficit > 0 && <p className="rounded-xl bg-warning-surface p-4 text-warning-foreground">Creator earnings deficit: {usd(account.deficit)}. Future Marketplace earnings will offset this amount before becoming available. New withdrawals are blocked.</p>}
    <div className="grid min-w-0 gap-4 @min-[680px]/earnings:grid-cols-2">
      <EarningsCard label="PayPal Payout Account" className="grid content-start gap-3">
        <div className="flex items-start gap-3"><EarningsIcon><PayPalMark /></EarningsIcon><div className="grid min-w-0 gap-0.5"><h2>PayPal Payout Account</h2><p className="text-muted-foreground">Required before requesting a withdrawal.</p></div><span className="ml-auto shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] leading-4 font-medium text-link">Required</span></div>
        <p id="payout-description" className="text-muted-foreground">Enter the PayPal email where you want to receive your earnings.</p>
        <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void submit(true); }}>
          <label className="sr-only" htmlFor="payout-email">Private PayPal payout email</label>
          <div className="relative"><Mail className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><input id="payout-email" type="email" autoComplete="email" aria-describedby="payout-description" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} placeholder="your-paypal-email@example.com" className="w-full rounded-lg border border-input bg-field pr-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60" /></div>
          <Button type="submit" className="w-fit shadow-none" disabled={busy}>Save PayPal Account</Button>
        </form>
        {account.email && <p className="text-muted-foreground">Each withdrawal keeps the payout email saved when it was requested.</p>}
      </EarningsCard>
      <EarningsCard label="Withdraw Earnings" className="grid content-start gap-3">
        <div className="flex items-start gap-3"><EarningsIcon><Landmark /></EarningsIcon><div className="grid gap-0.5"><h2>Withdraw Earnings</h2><p className="text-muted-foreground">Minimum withdrawal: $5.00 USD</p></div></div>
        <p id="withdrawal-description" className="text-muted-foreground">Withdrawals are held for 7 days before payout. The requested amount is reserved immediately and sent to your PayPal account after the hold and payment checks.</p>
        <form className="grid gap-3" onSubmit={event => { event.preventDefault(); void submit(false); }}>
          <label htmlFor="withdrawal-amount" className="sr-only">Requested amount (USD)</label>
          <div className="relative"><span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 border-r border-border pr-2 text-[13px] text-muted-foreground" aria-hidden="true">$</span><input id="withdrawal-amount" inputMode="decimal" value={amount} required disabled={busy} aria-describedby="withdrawal-description" onChange={event => setAmount(event.target.value)} placeholder="0.00" className="w-full rounded-lg border border-input bg-field pr-3 text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60" /></div>
          <Button type="submit" className="w-fit shadow-none disabled:bg-muted disabled:bg-none disabled:text-muted-foreground disabled:opacity-100" disabled={busy || confirmed || account.available < 500 || account.deficit > 0 || !account.email}>Request Withdrawal</Button>
          {confirmed && <Button type="button" variant="outline" className="w-fit" disabled={busy} onClick={() => { try { localStorage.removeItem(`sceenyk-withdrawal:${clerkUserId}`); } catch { /* Storage is advisory. */ } request.current = null; setConfirmed(false); setAmount(""); setMessage(""); }}>Request another withdrawal</Button>}
        </form>
        <p className="text-muted-foreground">Refunds may reduce or cancel a pending withdrawal. Payouts use PayPal Sandbox.</p>
      </EarningsCard>
    </div>
    {message && <p role="status" aria-live="polite" className="rounded-lg border border-border bg-muted p-3 text-muted-foreground">{message}</p>}
    <div className="grid min-w-0 items-start gap-4 @min-[680px]/earnings:grid-cols-2">
      <EarningsCard label="Payout History" className="grid content-start gap-3">
        <div className="flex items-center gap-3"><EarningsIcon small><ReceiptText /></EarningsIcon><h2>Payout History</h2></div>
        {!account.history.length && (account.total === 0 ? <EarningsEmptyState kind="payout" /> : <p className="text-muted-foreground">No withdrawals on this page.</p>)}
        {account.history.map(w => <article key={w.id} className="grid gap-1 border-t border-border pt-3">
          <div className="font-semibold tabular-nums">{usd(w.amount)} · {w.status.charAt(0).toUpperCase() + w.status.slice(1)}</div>
          <p className="text-muted-foreground">Requested {usd(w.requested)} on {new Date(w.requestedAt).toLocaleString()}</p>
          <p className="text-muted-foreground">Hold until {new Date(w.holdUntil).toLocaleString()}</p>
          {w.paidAt && <p>Paid {new Date(w.paidAt).toLocaleString()}</p>}
          {w.reviewRequired && <p className="text-warning-foreground">PayPal reported a return after payout. Contact support to reconcile it; the original paid record is preserved.</p>}
          {w.failureMessage && <p className="text-muted-foreground">{w.failureMessage}</p>}
        </article>)}
        {(account.total > 0 || page > 1) && <MarketplacePagination total={account.total} page={page} pageSize={12} itemLabel="withdrawal" href={value => `/credits/earnings?page=${value}`} />}
      </EarningsCard>
      {marketplaceSales}
    </div>
  </>;
}
