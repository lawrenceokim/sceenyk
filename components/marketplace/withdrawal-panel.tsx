"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { payoutDestinationAction, withdrawalRequestAction } from "@/app/actions/creator-withdrawals";
import { usd } from "@/lib/marketplace/payments/contract";
import type { WithdrawalAccount } from "@/lib/marketplace/withdrawals/contract";
import { MarketplacePagination } from "./pagination";

export function WithdrawalPanel({ account, page, clerkUserId, onChanged }: { account: WithdrawalAccount; page: number; clerkUserId: string; onChanged: () => Promise<void> }) {
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
  return <section className="space-y-5" aria-label="Creator withdrawals">
    <div className="grid gap-4 sm:grid-cols-3">{[["Available Earnings", account.available], ["Pending Payout", account.pending], ["Paid", account.paid]].map(([label, value]) => <div className="sceenyk-card p-5" key={label}><p className="text-body-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{usd(Number(value))}</p></div>)}</div>
    {account.deficit > 0 && <p className="rounded-xl bg-warning-surface p-4 text-warning-foreground">Creator earnings deficit: {usd(account.deficit)}. Future Marketplace earnings will offset this amount before becoming available. New withdrawals are blocked.</p>}
    <div className="sceenyk-card space-y-5 p-5">
      <h2 className="text-xl font-semibold">Withdraw creator earnings</h2>
      <p className="text-body-sm text-muted-foreground">Minimum withdrawal: $5 USD. Withdrawals are held for 7 days before payout. The requested amount is reserved immediately. Refunds may reduce or cancel a pending withdrawal. AI credits are separate. Payouts use PayPal Sandbox.</p>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(true); }}>
        <label className="block text-body-sm font-medium" htmlFor="payout-email">Private PayPal payout email</label>
        <input id="payout-email" type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} disabled={busy} className="min-h-11 w-full rounded-lg border border-input bg-field px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring" />
        <Button type="submit" variant="outline" disabled={busy}>Save payout email</Button>
        <p className="text-caption text-muted-foreground">Each withdrawal keeps the payout email saved when it was requested.</p>
      </form>
      <form className="space-y-3" onSubmit={event => { event.preventDefault(); void submit(false); }}>
        <label htmlFor="withdrawal-amount" className="block text-body-sm font-medium">Requested amount (USD)</label>
        <input id="withdrawal-amount" inputMode="decimal" value={amount} required disabled={busy} onChange={event => setAmount(event.target.value)} placeholder="5.00" className="min-h-11 w-full rounded-lg border border-input bg-field px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring" />
        <Button type="submit" disabled={busy || confirmed || account.available < 500 || account.deficit > 0 || !account.email}>Withdraw</Button>
        {confirmed && <Button type="button" variant="outline" disabled={busy} onClick={() => { try { localStorage.removeItem(`sceenyk-withdrawal:${clerkUserId}`); } catch { /* Storage is advisory. */ } request.current = null; setConfirmed(false); setAmount(""); setMessage(""); }}>Request another withdrawal</Button>}
      </form>
      <p role="status" className="text-body-sm text-muted-foreground">{message}</p>
    </div>
    <h2 className="text-xl font-semibold">Withdrawal history</h2>
    {!account.history.length && <p className="text-muted-foreground">No withdrawals yet.</p>}
    {account.history.map(w => <article key={w.id} className="sceenyk-card space-y-2 p-5">
      <p className="font-semibold">{usd(w.amount)} · {w.status.charAt(0).toUpperCase() + w.status.slice(1)}</p>
      <p className="text-body-sm text-muted-foreground">Requested {usd(w.requested)} on {new Date(w.requestedAt).toLocaleString()}</p>
      <p className="text-body-sm text-muted-foreground">Hold until {new Date(w.holdUntil).toLocaleString()}</p>
      {w.paidAt && <p className="text-body-sm">Paid {new Date(w.paidAt).toLocaleString()}</p>}
      {w.reviewRequired && <p className="text-body-sm text-warning">PayPal reported a return after payout. Contact support to reconcile it; the original paid record is preserved.</p>}
      {w.failureMessage && <p className="text-body-sm text-muted-foreground">{w.failureMessage}</p>}
    </article>)}
    <MarketplacePagination total={account.total} page={page} pageSize={12} itemLabel="withdrawal" href={value => `/dashboard/settings/earnings?page=${value}`} />
  </section>;
}
