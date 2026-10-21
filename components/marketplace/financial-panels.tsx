"use client";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import { creatorEarningsAction, marketplacePurchasesAction, recoverMarketplacePurchaseAction, createMarketplaceOrderAction } from "@/app/actions/marketplace-payments";
import { usd, type CreatorEarnings, type MarketplacePurchaseSummary } from "@/lib/marketplace/payments/contract";
import { MarketplacePagination } from "./pagination";
import { EarningsHistory } from "./earnings-history";
import { WithdrawalPanel } from "./withdrawal-panel";
import { withdrawalAccountAction } from "@/app/actions/creator-withdrawals";
import type { WithdrawalAccount } from "@/lib/marketplace/withdrawals/contract";
import { EarningsSkeleton, PurchasesSkeleton } from "@/components/payments/financial-skeletons";

type Props = { clerkUserId: string; page: number; earnings?: CreatorEarnings; withdrawals?: WithdrawalAccount; purchases?: { items: MarketplacePurchaseSummary[]; total: number } };
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
  const total = earnings?.total ?? purchases?.total ?? 0;
  return <div className="space-y-6"><div className="flex flex-wrap items-center gap-4"><Button variant="outline" disabled={busy} onClick={() => void refresh(true)}>{busy ? "Checking…" : earnings ? "Refresh earnings" : "Check purchases"}</Button><p role="status" className={`text-body-sm ${error ? "text-destructive" : "text-muted-foreground"}`}>{error || message}</p></div>{earnings ? <>{withdrawals && <WithdrawalPanel account={withdrawals} page={props.page} clerkUserId={props.clerkUserId} onChanged={() => refresh()} />}<EarningsHistory earnings={{ ...earnings, available: withdrawals?.available ?? earnings.available }} /></> : <><p className="text-body-sm text-muted-foreground">PayPal Sandbox template purchases include no AI credits or generation usage. Check saved purchases to recover payment and your project without paying again.</p>{purchases?.items.map(p => <article key={p.id} className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-3 p-5
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="break-words font-semibold">{p.title}</h2><p>{usd(p.amountMinor)} USD · {p.financialStatus.replaceAll("_", " ")}</p><p className="text-caption text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</p>{p.refundedMinor > 0 && <p className="text-body-sm text-muted-foreground">Refunded: {usd(p.refundedMinor)}. Your adopted project remains available.</p>}{p.projectId ? <Button nativeButton={false} render={<Link href={`/projects/${p.projectId}`} />}>Open adopted project</Button> : p.status !== "failed" ? <Button variant="outline" disabled={busy} onClick={() => void continueCheckout(p)}>{p.status === "completed" ? "Recover adopted project" : "Continue saved Sandbox checkout"}</Button> : <p className="text-body-sm text-muted-foreground">Payment failed. Reconciliation is required before another charge.</p>}</article>)}</>}{!total && <p className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card p-6 text-muted-foreground
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}>{earnings ? "No Marketplace sales yet." : "No paid Marketplace purchases yet."}</p>}<MarketplacePagination total={total} page={props.page} pageSize={12} href={page => `${earnings ? "/credits/earnings" : "/marketplace/purchases"}?page=${page}`} /></div>;
}
