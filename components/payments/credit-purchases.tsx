"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Coins, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelCreditOrderAction, completeCreditOrderAction, createCreditOrderAction, creditWalletAction, reconcileCreditOrdersAction } from "@/app/actions/payments";
import type { CreditPack, CreditWallet, PurchaseStatus } from "@/lib/payments/types";
import { creditRefreshKey, notifyCreditsChanged } from "@/lib/accounting/client-events";

const statusCopy: Record<PurchaseStatus, string> = {
  pending: "Awaiting PayPal approval. No credits have been added.",
  approved: "Payment is processing. Check purchases again shortly.",
  completed: "Purchase successful. Your paid credit balance is updated.",
  cancelled: "Checkout cancelled. No credits were granted for this cancellation.",
  failed: "Payment failed. No credits were added.",
};

type Props = { clerkUserId: string; packs: CreditPack[]; configured: boolean; checkoutInNewTab?: boolean };

export function CreditPurchases(props: Props) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn || userId !== props.clerkUserId) return <p role="status">Opening your credit account…</p>;
  return <PurchaseAccount key={userId} {...props} />;
}

function PurchaseAccount({ packs, configured, checkoutInNewTab = false }: Props) {
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [approvalLink, setApprovalLink] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<string | null>(null);
  const active = useRef(true);
  const running = useRef(false);
  const previousWallet = useRef<CreditWallet | null>(null);

  const reload = useCallback(async () => {
    const result = await creditWalletAction();
    if (!active.current) return;
    setWalletLoaded(true);
    if (result.ok) {
      const previous = previousWallet.current;
      const completed = result.data.purchases.find(purchase => purchase.status === "completed" && previous?.purchases.some(old => old.orderId === purchase.orderId && old.status !== "completed"));
      if (completed?.orderId) { setCompletedOrder(completed.orderId); setMessage(statusCopy.completed); setApprovalLink(null); }
      setWallet(result.data);
      previousWallet.current = result.data;
      if (!previous || previous.available !== result.data.available || previous.reserved !== result.data.reserved) notifyCreditsChanged();
    }
    else { setWallet(null); setError("Credit balance couldn’t be loaded. Check purchases again."); }
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError("");
    try { await work(); }
    catch { if (active.current) setError("Payment status is uncertain. Check your saved purchases before starting another checkout."); }
    finally { if (active.current) { setBusy(false); setWalletLoaded(true); } running.current = false; }
  }, []);

  const checkPurchases = useCallback(() => run(async () => {
    if (configured) {
      const result = await reconcileCreditOrdersAction();
      if (!active.current) return;
      if (!result.ok) setError(result.message);
      else if (result.data.pending) setMessage("Some payments still need recovery. Check purchases again shortly.");
      else if (result.data.recovered) {
        setMessage(statusCopy.completed);
        setCompletedOrder(result.data.recoveredOrders[0] ?? null);
      }
    }
    await reload();
  }), [configured, reload, run]);

  useEffect(() => {
    active.current = true;
    void run(async () => {
      const url = new URL(window.location.href);
      const orderId = url.searchParams.get("token");
      const checkout = url.searchParams.get("checkout");
      if (configured && orderId && (checkout === "return" || checkout === "cancel")) {
        const result = await (checkout === "cancel" ? cancelCreditOrderAction({ orderId }) : completeCreditOrderAction({ orderId }));
        if (!active.current) return;
        if (result.ok) {
          setMessage(statusCopy[result.data.status]);
          if (result.data.status === "completed") setCompletedOrder(orderId);
          url.searchParams.delete("token"); url.searchParams.delete("PayerID"); url.searchParams.delete("checkout");
          window.history.replaceState(null, "", url.pathname + url.search);
        } else setError(result.message);
      } else if (configured) {
        const result = await reconcileCreditOrdersAction();
        if (active.current) {
          if (!result.ok) setError(result.message);
          else if (result.data.recovered) {
            setMessage(statusCopy.completed);
            setCompletedOrder(result.data.recoveredOrders[0] ?? null);
          }
        }
      }
      await reload();
    });
    const reactivate = () => { if (document.visibilityState === "visible") void checkPurchases(); };
    const storage = (event: StorageEvent) => { if (event.key === creditRefreshKey) reactivate(); };
    window.addEventListener("pageshow", reactivate);
    window.addEventListener("focus", reactivate);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", reactivate);
    return () => {
      active.current = false;
      window.removeEventListener("pageshow", reactivate);
      window.removeEventListener("focus", reactivate);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", reactivate);
    };
  }, [configured, reload, run, checkPurchases]);

  function checkout(packId: string) {
    if (running.current) return;
    // Open during the click gesture; keep the editor and local Files mounted.
    const popup = checkoutInNewTab ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    void run(async () => {
      let opened = false;
      try {
        setCompletedOrder(null); setApprovalLink(null);
        const result = await createCreditOrderAction({ packId });
        if (!active.current) return;
        if (!result.ok) { setError(result.message); await reload(); return; }
        if (result.data.approvalUrl) {
          if (checkoutInNewTab) {
            setApprovalLink(result.data.approvalUrl);
            if (popup && !popup.closed) { popup.location.replace(result.data.approvalUrl); opened = true; }
            setMessage("Approve your test purchase in PayPal Sandbox, then return here. Check purchases to refresh your balance.");
          } else {
            setMessage("Opening PayPal Sandbox checkout…");
            window.location.assign(result.data.approvalUrl);
          }
        } else {
          setMessage(statusCopy[result.data.status]);
          if (result.data.status === "completed") setCompletedOrder(result.data.orderId);
          await reload();
        }
      } finally { if (popup && !opened) popup.close(); }
    });
  }

  const completedPurchase = wallet?.purchases.find(purchase => purchase.orderId === completedOrder && purchase.status === "completed");
  const activityCopy = { purchase: "Credits purchased", reservation: "Generation reservation", consumption: "Generation completed", release: "Reservation restored" };
  return <div className="space-y-6" aria-busy={busy}>
    <section className="sceenyk-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6" aria-label="Paid credit balance">
      <div>
        <p className="text-caption text-muted-foreground">Available paid credits</p>
        <p className="mt-2 text-3xl font-bold">{wallet ? wallet.available.toLocaleString() : "—"}</p>
        {wallet && <p className="mt-2 text-caption text-muted-foreground">{wallet.reserved.toLocaleString()} reserved for generations in progress</p>}
        <p className="mt-2 text-caption text-muted-foreground">Purchased credits do not expire.</p>
      </div>
      <Button variant="outline" disabled={busy} onClick={() => void checkPurchases()}>{busy ? "Checking payment…" : "Check purchases"}</Button>
    </section>
    {wallet?.lowBalance && <p className="rounded-lg bg-warning-surface p-3 text-body-sm text-warning-foreground">You’re running low on paid credits. Top up when you need more. Your free allowance stays separate.</p>}
    {!configured && <p className="rounded-lg border border-border bg-muted p-4 text-body-sm" role="status">Sandbox checkout is awaiting configuration. Your existing balance is preserved.</p>}
    {message && <p className={`rounded-lg p-4 text-body-sm ${completedPurchase ? "bg-success-surface text-success-foreground" : "bg-info-surface text-info-foreground"}`} role="status" aria-live="polite">
      {completedPurchase ? `${completedPurchase.credits.toLocaleString()} credits added. Current paid balance: ${wallet!.available.toLocaleString()} credits.` : message}
    </p>}
    {approvalLink && <Button nativeButton={false} variant="outline" render={<a href={approvalLink} target="_blank" rel="noopener noreferrer" />}>Continue to PayPal Sandbox <ExternalLink className="size-4" aria-hidden="true" /></Button>}
    {error && <p className="rounded-lg bg-destructive-surface p-4 text-body-sm text-destructive" role="alert">{error}</p>}
    <section aria-label="Sandbox demo credit packs" className="grid gap-4 md:grid-cols-3">
      {packs.map(pack => <article key={pack.id} className="sceenyk-card flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <span className="w-fit rounded-full bg-accent px-3 py-1 text-caption font-medium text-accent-foreground">Sandbox test pack</span>
        <Coins className="size-6 text-link" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{pack.name}</h2>
        <p className="text-3xl font-bold">{pack.credits.toLocaleString()} <span className="text-body-sm font-normal text-muted-foreground">credits</span></p>
        <p className="text-body font-medium">${pack.amount} {pack.currency} <span className="text-caption text-muted-foreground">test funds</span></p>
        <p className="text-caption text-muted-foreground">One-time Sandbox purchase. Temporary demo values. Credits stay available until you use them.</p>
        <Button className="mt-auto h-auto min-h-11 whitespace-normal" disabled={!configured || busy || !wallet} onClick={() => checkout(pack.id)}>
          Pay with PayPal Sandbox <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </article>)}
    </section>
    <section className="sceenyk-card space-y-4 p-5 sm:p-6" aria-labelledby="purchases-heading">
      <h2 id="purchases-heading" className="text-lg font-semibold">Recent purchases</h2>
      {!wallet ? <p className="text-body-sm text-muted-foreground">{walletLoaded ? "Saved purchases are unavailable. Check purchases to try again." : "Loading saved purchases…"}</p> : !wallet.purchases.length ? <p className="text-body-sm text-muted-foreground">No credit purchases yet.</p> :
        <ul className="divide-y divide-border">{wallet.purchases.map((purchase, index) => <li key={purchase.orderId ?? `${purchase.created_at}-${index}`} className="space-y-2 py-4">
          <div className="flex flex-wrap justify-between gap-2 text-body-sm"><p className="font-medium">{purchase.pack_name} · {purchase.credits} credits</p><p>${purchase.amount} {purchase.currency} · {purchase.status}</p></div>
          <p className="text-caption text-muted-foreground">{statusCopy[purchase.status]}</p>
          <p className="text-caption text-muted-foreground"><time dateTime={purchase.created_at}>{new Date(purchase.created_at).toLocaleString()}</time></p>
          {purchase.status === "pending" && <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !configured || !packs.some(pack => pack.id === purchase.pack_id)} onClick={() => checkout(purchase.pack_id)}>Continue checkout</Button>
            {purchase.orderId && <Button variant="ghost" disabled={busy || !configured} onClick={() => void run(async () => {
              const result = await cancelCreditOrderAction({ orderId: purchase.orderId });
              if (!active.current) return;
              if (result.ok) setMessage(statusCopy[result.data.status]); else setError(result.message);
              await reload();
            })}>Cancel checkout</Button>}
          </div>}
        </li>)}</ul>}
    </section>
    <section className="sceenyk-card space-y-4 p-5 sm:p-6" aria-labelledby="credit-activity-heading">
      <h2 id="credit-activity-heading" className="text-lg font-semibold">Paid credit activity</h2>
      <p className="text-caption text-muted-foreground">Last 20 paid credit movements. Completion spends credits already reserved; it does not deduct them twice. Free generations are tracked separately.</p>
      {!wallet ? <p className="text-body-sm text-muted-foreground">{walletLoaded ? "Credit activity is unavailable. Check purchases to try again." : "Loading activity…"}</p> : !wallet.activity.length ? <p className="text-body-sm text-muted-foreground">No paid credit activity yet.</p> : <ul className="divide-y divide-border">
        {wallet.activity.map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-body-sm">
          <div><p className="font-medium">{activityCopy[entry.type]}</p><time className="text-caption text-muted-foreground" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></div>
          <p>{entry.type === "consumption" ? `${entry.amount.toLocaleString()} reserved credits used` : `${entry.availableDelta > 0 ? "+" : ""}${entry.availableDelta.toLocaleString()} available credits`}</p>
        </li>)}
      </ul>}
    </section>
  </div>;
}
