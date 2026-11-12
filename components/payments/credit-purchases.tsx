"use client";
import { CreditAccountSkeleton, FinancialRowsSkeleton } from "./financial-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelCreditOrderAction, completeCreditOrderAction, createCreditOrderAction, reconcileCreditOrdersAction } from "@/lib/cache/actions/payments";
import type { CreditWallet, PurchaseStatus } from "@/lib/payments/types";
import { creditRefreshKey, notifyCreditsChanged } from "@/lib/accounting/client-events";
import { CreditBillingDashboard } from "./credit-billing-dashboard";
import { CustomCreditPurchase } from "./custom-credit-purchase";
import type { CreditPurchasePricing } from "@/lib/payments/credit-pricing";
import { AppNotification } from "@/components/notifications/app-notification";
import { useAccountQuery } from "@/components/cache/use-account-query";
import { accountSessionCache } from "@/lib/cache/account-cache";


const statusCopy: Record<PurchaseStatus, string> = {
  pending: "Awaiting PayPal approval. No credits have been added.",
  approved: "Payment is processing. Check purchases again shortly.",
  completed: "Purchase successful. Your paid credit balance is updated.",
  cancelled: "Checkout cancelled. No credits were granted for this cancellation.",
  failed: "Payment failed. No credits were added.",
};

type Props = { clerkUserId: string; pricing: CreditPurchasePricing; configured: boolean; checkoutInNewTab?: boolean; dashboard?: boolean; cachedOnly?: boolean };

export function CreditPurchases(props: Props) {
  const { userId, sessionId, isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <CreditAccountSkeleton dashboard={props.dashboard} />;
  if (!isSignedIn || userId !== props.clerkUserId) return <p role="status">Opening your credit account…</p>;
  return <PurchaseAccount key={`${userId}/${sessionId}`} {...props} />;
}

function PurchaseAccount({ pricing, configured, checkoutInNewTab = false, dashboard = false, cachedOnly = false }: Props) {
  const query = useAccountQuery("wallet", 1, { automatic: false, cachedOnly });
  const { refresh: refreshWallet, scope } = query;
  const wallet = query.data ?? null;
  const [walletLoaded, setWalletLoaded] = useState(!!query.data);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [approvalLink, setApprovalLink] = useState<string | null>(null);
  const [completedOrder, setCompletedOrder] = useState<string | null>(null);
  const active = useRef(true);
  const running = useRef(false);
  const previousWallet = useRef<CreditWallet | null>(wallet);

  const reload = useCallback(async (force = false) => {
    const data = await refreshWallet(force);
    if (!active.current) return;
    setWalletLoaded(true);
    if (data) {
      const previous = previousWallet.current;
      const completed = data.purchases.find(purchase => purchase.status === "completed" && previous?.purchases.some(old => old.orderId === purchase.orderId && old.status !== "completed"));
      if (completed?.orderId) { setCompletedOrder(completed.orderId); setMessage(statusCopy.completed); setApprovalLink(null); }
      previousWallet.current = data;
      if (!previous || previous.available !== data.available || previous.reserved !== data.reserved) notifyCreditsChanged(true);
    }
  }, [refreshWallet]);

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
    await reload(true);
  }), [configured, reload, run]);

  useEffect(() => {
    active.current = true;
    if (cachedOnly) return () => { active.current = false; };
    const incoming = new URL(window.location.href);
    const hasReturn = incoming.searchParams.has("token") && ["return", "cancel"].includes(incoming.searchParams.get("checkout") ?? "");
    if (hasReturn || !accountSessionCache.fresh(scope, "wallet:1")) void run(async () => {
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
      } else if (configured && !accountSessionCache.fresh(scope, "wallet:1") && accountSessionCache.permit(scope, "credit-recovery")) {
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
    const reactivate = () => { if (document.visibilityState === "visible" && !accountSessionCache.fresh(scope, "wallet:1") && accountSessionCache.permit(scope, "credit-recovery")) void checkPurchases(); };
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
  }, [configured, reload, run, checkPurchases, scope, cachedOnly]);

  function checkout(input: { amountUsd: string; pricingVersion: string } | { purchaseId: string }) {
    if (running.current) return;
    // Open during the click gesture; keep the editor and local Files mounted.
    const popup = checkoutInNewTab ? window.open("about:blank", "_blank") : null;
    if (popup) popup.opener = null;
    void run(async () => {
      let opened = false;
      try {
        setCompletedOrder(null); setApprovalLink(null);
        const result = await createCreditOrderAction(input);
        if (!active.current) return;
        if (!result.ok) { setError(result.message); await reload(); return; }
        if (result.data.approvalUrl) {
          if (checkoutInNewTab) {
            setApprovalLink(result.data.approvalUrl);
            if (popup && !popup.closed) { popup.location.replace(result.data.approvalUrl); opened = true; }
            setMessage("Approve your purchase in PayPal, then return here. Check purchases to refresh your balance.");
          } else {
            setMessage("Opening PayPal checkout…");
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
  const purchaseForm = <CustomCreditPurchase pricing={pricing} presentation={dashboard ? "billing" : "default"} disabled={!configured || busy || !wallet} onCheckout={amountUsd => checkout({ amountUsd, pricingVersion: pricing.version })} />;
  if (dashboard) return <CreditBillingDashboard purchaseForm={purchaseForm} wallet={wallet} walletLoaded={walletLoaded} busy={busy} configured={configured} statusCopy={statusCopy}
    onCheckPurchases={() => void checkPurchases()} onResumeCheckout={purchaseId => checkout({ purchaseId })}
    onCancelCheckout={orderId => void run(async () => {
      const result = await cancelCreditOrderAction({ orderId });
      if (!active.current) return;
      if (result.ok) setMessage(statusCopy[result.data.status]); else setError(result.message);
      await reload();
    })}
    notices={<>
      {wallet?.lowBalance && <AppNotification className="text-warning-foreground">Low paid credit balance. Top up when you need more.</AppNotification>}
      {!configured && <AppNotification className="rounded-lg border border-border bg-muted px-3 py-2" role="status">PayPal checkout is currently unavailable. Your existing balance is preserved.</AppNotification>}
      {message && <AppNotification className={`rounded-lg px-3 py-2 ${completedPurchase ? "bg-success-surface text-success-foreground" : "bg-info-surface text-info-foreground"}`} role="status" aria-live="polite">
        {completedPurchase ? `${completedPurchase.credits.toLocaleString()} credits added. Current paid balance: ${wallet!.available.toLocaleString()} credits.` : message}
      </AppNotification>}
      {approvalLink && <Button nativeButton={false} variant="outline" render={<a href={approvalLink} target="_blank" rel="noopener noreferrer" />}>Continue to PayPal <ExternalLink className="size-4" aria-hidden="true" /></Button>}
      {error && <AppNotification className="rounded-lg bg-destructive-surface px-3 py-2 text-destructive" role="alert">{error}</AppNotification>}
    </>} />;
  return <div className="space-y-6" aria-busy={busy}>
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card flex flex-wrap items-center justify-between gap-4
      p-5 sm:p-6 [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} aria-label="Paid credit balance">
      <div>
        <p className="text-caption text-muted-foreground">Available paid credits</p>
        <p className="mt-2 text-3xl font-bold">{wallet ? wallet.available.toLocaleString() : walletLoaded ? "—" : <Skeleton className="h-9 w-24" />}</p>
        {wallet && <p className="mt-2 text-caption text-muted-foreground">{wallet.reserved.toLocaleString()} reserved for generations in progress</p>}
        <p className="mt-2 text-caption text-muted-foreground">Purchased credits do not expire.</p>
      </div>
      <Button variant="outline" disabled={busy} onClick={() => void checkPurchases()}>{busy ? "Checking payment…" : "Check purchases"}</Button>
    </section>
    {wallet?.lowBalance && <AppNotification className="rounded-lg bg-warning-surface p-3 text-body-sm text-warning-foreground">You’re running low on paid credits. Top up when you need more. Your free allowance stays separate.</AppNotification>}
    {!configured && <AppNotification className="rounded-lg border border-border bg-muted p-4 text-body-sm" role="status">PayPal checkout is currently unavailable. Your existing balance is preserved.</AppNotification>}
    {message && <AppNotification className={`rounded-lg p-4 text-body-sm ${completedPurchase ? "bg-success-surface text-success-foreground" : "bg-info-surface text-info-foreground"}`} role="status" aria-live="polite">
      {completedPurchase ? `${completedPurchase.credits.toLocaleString()} credits added. Current paid balance: ${wallet!.available.toLocaleString()} credits.` : message}
    </AppNotification>}
    {approvalLink && <Button nativeButton={false} variant="outline" render={<a href={approvalLink} target="_blank" rel="noopener noreferrer" />}>Continue to PayPal <ExternalLink className="size-4" aria-hidden="true" /></Button>}
    {error && <AppNotification className="rounded-lg bg-destructive-surface p-4 text-body-sm text-destructive" role="alert">{error}</AppNotification>}
    {purchaseForm}
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-4 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} aria-labelledby="purchases-heading">
      <h2 id="purchases-heading" className="text-lg font-semibold">Recent purchases</h2>
      {!wallet ? walletLoaded ? <AppNotification className="text-body-sm text-muted-foreground">Saved purchases are unavailable. Check purchases to try again.</AppNotification> : <FinancialRowsSkeleton /> : !wallet.purchases.length ? <p className="text-body-sm text-muted-foreground">No credit purchases yet.</p> :
        <ul className="divide-y divide-border">{wallet.purchases.map((purchase, index) => <li key={purchase.orderId ?? `${purchase.created_at}-${index}`} className="space-y-2 py-4">
          <div className="flex flex-wrap justify-between gap-2 text-body-sm"><p className="font-medium">{purchase.pack_name.replace(/\bTest Pack\b/g, "Pack")} · {purchase.credits} credits</p><p>${purchase.amount} {purchase.currency} · {purchase.status}</p></div>
          <p className="text-caption text-muted-foreground">{statusCopy[purchase.status]}</p>
          {purchase.pricing && <p className="text-caption text-muted-foreground">Estimated PayPal fee ${(purchase.pricing.paypalFeeMinor / 100).toFixed(2)} · Sceenyk commission ${(purchase.pricing.commissionMinor / 100).toFixed(2)}</p>}
          <p className="text-caption text-muted-foreground"><time dateTime={purchase.created_at}>{new Date(purchase.created_at).toLocaleString()}</time></p>
          {purchase.status === "pending" && <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || !configured} onClick={() => checkout({ purchaseId: purchase.id })}>Continue checkout</Button>
            {purchase.orderId && <Button variant="ghost" disabled={busy || !configured} onClick={() => void run(async () => {
              const result = await cancelCreditOrderAction({ orderId: purchase.orderId });
              if (!active.current) return;
              if (result.ok) setMessage(statusCopy[result.data.status]); else setError(result.message);
              await reload();
            })}>Cancel checkout</Button>}
          </div>}
        </li>)}</ul>}
    </section>
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-4 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} aria-labelledby="credit-activity-heading">
      <h2 id="credit-activity-heading" className="text-lg font-semibold">Paid credit activity</h2>
      <p className="text-caption text-muted-foreground">Last 20 paid credit movements. Completion spends credits already reserved; it does not deduct them twice. Free AI projects are tracked separately.</p>
      {!wallet ? walletLoaded ? <AppNotification className="text-body-sm text-muted-foreground">Credit activity is unavailable. Check purchases to try again.</AppNotification> : <FinancialRowsSkeleton /> : !wallet.activity.length ? <p className="text-body-sm text-muted-foreground">No paid credit activity yet.</p> : <ul className="divide-y divide-border">
        {wallet.activity.map((entry, index) => <li key={`${entry.createdAt}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-body-sm">
          <div><p className="font-medium">{activityCopy[entry.type]}</p><time className="text-caption text-muted-foreground" dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString()}</time></div>
          <p>{entry.type === "consumption" ? `${entry.amount.toLocaleString()} reserved credits used` : `${entry.availableDelta > 0 ? "+" : ""}${entry.availableDelta.toLocaleString()} available credits`}</p>
        </li>)}
      </ul>}
    </section>
  </div>;
}
