"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Coins, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelCreditOrderAction, completeCreditOrderAction, createCreditOrderAction, creditWalletAction, reconcileCreditOrdersAction } from "@/app/actions/payments";
import type { CreditPack, CreditWallet, PurchaseStatus } from "@/lib/payments/types";

const statusCopy: Record<PurchaseStatus, string> = {
  pending: "Awaiting PayPal approval. No credits have been added.",
  approved: "Payment is processing. Check purchases again shortly.",
  completed: "Purchase successful. Your paid credit balance is updated.",
  cancelled: "Checkout cancelled. No credits were granted for this cancellation.",
  failed: "Payment failed. No credits were added.",
};

type Props = { clerkUserId: string; packs: CreditPack[]; configured: boolean };

export function CreditPurchases(props: Props) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn || userId !== props.clerkUserId) return <p role="status">Opening your credit account…</p>;
  return <PurchaseAccount key={userId} {...props} />;
}

function PurchaseAccount({ packs, configured }: Props) {
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [walletLoaded, setWalletLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useRef(true);
  const running = useRef(false);

  const reload = useCallback(async () => {
    const result = await creditWalletAction();
    if (!active.current) return;
    setWalletLoaded(true);
    if (result.ok) { setWallet(result.data); window.dispatchEvent(new Event("sceenyk:credits")); }
    else { setWallet(null); setError("Credit balance couldn’t be loaded. Check purchases again."); }
  }, []);

  const run = useCallback(async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true); setError(""); setMessage("");
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
      else if (result.data.recovered) setMessage(statusCopy.completed);
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
          url.searchParams.delete("token"); url.searchParams.delete("PayerID"); url.searchParams.delete("checkout");
          window.history.replaceState(null, "", url.pathname + url.search);
        } else setError(result.message);
      } else if (configured) {
        const result = await reconcileCreditOrdersAction();
        if (active.current && !result.ok) setError(result.message);
      }
      await reload();
    });
    const reactivate = () => { if (document.visibilityState === "visible") void checkPurchases(); };
    window.addEventListener("pageshow", reactivate);
    document.addEventListener("visibilitychange", reactivate);
    return () => {
      active.current = false;
      window.removeEventListener("pageshow", reactivate);
      document.removeEventListener("visibilitychange", reactivate);
    };
  }, [configured, reload, run, checkPurchases]);

  function checkout(packId: string) {
    void run(async () => {
      const result = await createCreditOrderAction({ packId });
      if (!active.current) return;
      if (!result.ok) { setError(result.message); await reload(); return; }
      if (result.data.approvalUrl) {
        setMessage("Opening PayPal Sandbox checkout…");
        window.location.assign(result.data.approvalUrl);
      } else { setMessage(statusCopy[result.data.status]); await reload(); }
    });
  }

  return <div className="space-y-6" aria-busy={busy}>
    <section className="sceenyk-card flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6" aria-label="Paid credit balance">
      <div>
        <p className="text-caption text-muted-foreground">Available paid credits</p>
        <p className="mt-2 text-3xl font-bold">{wallet ? wallet.available.toLocaleString() : "—"}</p>
        {wallet && <p className="mt-2 text-caption text-muted-foreground">{wallet.reserved.toLocaleString()} reserved for generations in progress</p>}
      </div>
      <Button variant="outline" disabled={busy} onClick={() => void checkPurchases()}>{busy ? "Checking payment…" : "Check purchases"}</Button>
    </section>
    {!configured && <p className="rounded-lg border border-border bg-muted p-4 text-body-sm" role="status">Sandbox checkout is awaiting configuration. Your existing balance is preserved.</p>}
    {message && <p className="rounded-lg bg-info-surface p-4 text-body-sm text-info-foreground" role="status" aria-live="polite">{message}</p>}
    {error && <p className="rounded-lg bg-destructive-surface p-4 text-body-sm text-destructive" role="alert">{error}</p>}
    <section aria-label="Sandbox demo credit packs" className="grid gap-4 md:grid-cols-3">
      {packs.map(pack => <article key={pack.id} className="sceenyk-card flex min-w-0 flex-col gap-4 p-5 sm:p-6">
        <span className="w-fit rounded-full bg-accent px-3 py-1 text-caption font-medium text-accent-foreground">Sandbox test pack</span>
        <Coins className="size-6 text-link" aria-hidden="true" />
        <h2 className="text-lg font-semibold">{pack.name}</h2>
        <p className="text-3xl font-bold">{pack.credits.toLocaleString()} <span className="text-body-sm font-normal text-muted-foreground">credits</span></p>
        <p className="text-body font-medium">${pack.amount} {pack.currency} <span className="text-caption text-muted-foreground">test funds</span></p>
        <p className="text-caption text-muted-foreground">One-time Sandbox purchase. Temporary hackathon values.</p>
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
          {purchase.orderId && <p className="break-all text-caption text-muted-foreground">Sandbox order {purchase.orderId}</p>}
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
  </div>;
}
