"use client";
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { creatorEarningsAction, marketplacePurchasesAction, recoverMarketplacePurchaseAction, createMarketplaceOrderAction } from "@/app/actions/marketplace-payments";
import { type CreatorEarnings, type MarketplacePurchaseSummary } from "@/lib/marketplace/payments/contract";
import { PurchasesDashboard } from "./purchases-dashboard";
import { EarningsDashboard } from "./earnings-dashboard";
import { withdrawalAccountAction } from "@/app/actions/creator-withdrawals";
import type { WithdrawalAccount } from "@/lib/marketplace/withdrawals/contract";
import { EarningsSkeleton, PurchasesSkeleton } from "@/components/payments/financial-skeletons";

type Props = { purchasePreviews?: Record<string, ReactNode>; clerkUserId: string; page: number; earnings?: CreatorEarnings; withdrawals?: WithdrawalAccount; purchases?: { items: MarketplacePurchaseSummary[]; total: number } };
export function FinancialPanel(props: Props) {
  return useAuthAvailable() ? <AccountPanel {...props} /> : <p>Sign in is temporarily unavailable.</p>;
}
function AccountPanel(props: Props) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return props.earnings ? <EarningsSkeleton /> : <PurchasesSkeleton />;
  if (userId !== props.clerkUserId) return <AccountAction intent="sign-in">Sign in to view your Marketplace account</AccountAction>;
  return <Panel key={`${userId}:${props.page}`} {...props} />;
}
function Panel(props: Props) {
  const [earnings, setEarnings] = useState(props.earnings);
  const [purchases, setPurchases] = useState(props.purchases);
  const [withdrawals, setWithdrawals] = useState(props.withdrawals);
  const [busy, setBusy] = useState(false); const inFlight = useRef(false); const alive = useRef(true);
  const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function refresh(recover = false) {
    if (inFlight.current) return; inFlight.current = true; if (alive.current) { setBusy(true); setError(""); }
    try {
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
  const activateRecovery = useEffectEvent(() => { void refresh(true); });
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
