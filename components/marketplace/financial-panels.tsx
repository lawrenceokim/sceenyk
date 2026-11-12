"use client";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { creatorEarningsAction, marketplacePurchasesAction, recoverMarketplacePurchaseAction, createMarketplaceOrderAction } from "@/lib/cache/actions/marketplace-payments";
import { type CreatorEarnings, type MarketplacePurchaseSummary } from "@/lib/marketplace/payments/contract";
import { PurchasesDashboard } from "./purchases-dashboard";
import { EarningsDashboard } from "./earnings-dashboard";
import { withdrawalAccountAction } from "@/lib/cache/actions/creator-withdrawals";
import type { WithdrawalAccount } from "@/lib/marketplace/withdrawals/contract";
import { EarningsSkeleton, PurchasesSkeleton } from "@/components/payments/financial-skeletons";
import { AppNotification } from "@/components/notifications/app-notification";
import { useAccountQuery } from "@/components/cache/use-account-query";
import { accountSessionCache } from "@/lib/cache/account-cache";


type Props = { cacheMode?: boolean; cachedOnly?: boolean; purchasePreviews?: Record<string, ReactNode>; clerkUserId: string; page: number; earnings?: CreatorEarnings; withdrawals?: WithdrawalAccount; purchases?: { items: MarketplacePurchaseSummary[]; total: number } };
export function FinancialPanel(props: Props) {
  return useAuthAvailable() ? <AccountPanel {...props} /> : <AppNotification>Sign in is temporarily unavailable.</AppNotification>;
}
function AccountPanel(props: Props) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return props.earnings ? <EarningsSkeleton /> : <PurchasesSkeleton />;
  if (userId !== props.clerkUserId) return <AccountAction intent="sign-in">Sign in to view your Marketplace account</AccountAction>;
  return <Panel key={`${userId}:${props.page}`} {...props} />;
}
function Panel(props: Props) {
  const [savedEarnings, setEarnings] = useState(props.earnings);
  const [savedPurchases, setPurchases] = useState(props.purchases);
  const [savedWithdrawals, setWithdrawals] = useState(props.withdrawals);
  const earnings = props.cacheMode ? props.earnings : savedEarnings, purchases = props.cacheMode ? props.purchases : savedPurchases, withdrawals = props.cacheMode ? props.withdrawals : savedWithdrawals;
  const query = useAccountQuery(props.earnings ? "earnings" : "history", props.page, { cachedOnly: true });
  const [busy, setBusy] = useState(false); const inFlight = useRef(false); const alive = useRef(true);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function refresh(recover = false) {
    if (inFlight.current) return; inFlight.current = true; if (alive.current) { setBusy(true); setError(""); }
    try {
      if (props.cacheMode) {
        if (recover && !props.earnings) for (const purchase of (purchases?.items ?? []).filter(p => !p.projectId && p.status !== "failed").slice(0, 5)) {
          const result = await recoverMarketplacePurchaseAction({ purchaseId: purchase.id });
          if (!alive.current) return;
          if (!result.ok) setError(result.message);
        }
        await query.refresh();
        return;
      }
      if (props.earnings) {
        const r = await creatorEarningsAction(props.page);
        if (!alive.current) return; if (!r.ok) { setError(r.message); return; }
        if (r.data.clerkUserId === props.clerkUserId) setEarnings(r.data.earnings);
        const w = await withdrawalAccountAction(props.page);
        if (!alive.current) return;
        if (w.ok && w.data.clerkUserId === props.clerkUserId) setWithdrawals(w.data.account);
        else if (!w.ok) setError(w.message);
      } else {
        if (recover) {
          // Bound recovery; this includes completed entitlements with no project.
          for (const p of (purchases?.items ?? []).filter(p => !p.projectId && p.status !== "failed").slice(0, 5)) {
            const r = await recoverMarketplacePurchaseAction({ purchaseId: p.id });
            if (!alive.current) return;
            if (!r.ok) setError(r.message);
          }
        }
        const r = await marketplacePurchasesAction(props.page);
        if (!alive.current) return; if (!r.ok) { setError(r.message); return; }
        if (r.data.clerkUserId === props.clerkUserId) setPurchases(r.data);
      }
    } catch { if (alive.current) setError("Marketplace couldn’t be refreshed. Check your connection and try again."); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }
  const activateRecovery = useEffectEvent(() => {
    if (props.cachedOnly) return;
    if (props.cacheMode && (props.earnings || !(purchases?.items ?? []).some(p => !p.projectId && p.status !== "failed") || !accountSessionCache.permit(query.scope, `history-recovery:${props.page}`))) return;
    void refresh(true);
  });
  useEffect(() => {
    alive.current = true;
    const initial = window.setTimeout(activateRecovery, 0);
    const activate = () => { if (document.visibilityState === "visible") activateRecovery(); };
    window.addEventListener("focus", activate); document.addEventListener("visibilitychange", activate);
    return () => { alive.current = false; window.clearTimeout(initial); window.removeEventListener("focus", activate); document.removeEventListener("visibilitychange", activate); };
  }, []);
  async function continueCheckout(p: MarketplacePurchaseSummary) {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    try {
      const r = await createMarketplaceOrderAction({ purchaseId: p.id });
      if (!alive.current) return;
      if (!r.ok) { setError(r.message); return; }
      if (r.data.approvalUrl) window.location.assign(r.data.approvalUrl);
      else setMessage(r.data.purchase.projectId ? "Payment verified. Open your adopted project below." : "Payment is awaiting approval or verification.");
    } catch { if (alive.current) setError("Checkout couldn’t be opened. Check the saved purchase before trying again."); }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
    await refresh(true);
  }
  if (earnings) return <EarningsDashboard earnings={earnings} account={withdrawals} page={props.page} clerkUserId={props.clerkUserId} busy={busy} error={error} message={message} onRefresh={() => refresh()} />;
  return <PurchasesDashboard purchases={purchases} previews={props.purchasePreviews} page={props.page} busy={busy} error={error} message={message} onRefresh={() => refresh(true)} onContinueCheckout={continueCheckout} />;
}
