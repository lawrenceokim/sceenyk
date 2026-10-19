"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { marketplaceCheckoutAction, createMarketplaceOrderAction, recoverMarketplacePurchaseAction } from "@/app/actions/marketplace-payments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { usd, type MarketplacePurchaseSummary } from "@/lib/marketplace/payments/contract";

export function PaidAdoption({ listingId, estimate }: { listingId: string; estimate: { credits: number; test: boolean } | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [purchase, setPurchase] = useState<MarketplacePurchaseSummary | null>(null);
  const [busy, setBusy] = useState(false); const inFlight = useRef(false);
  const [error, setError] = useState(""); const [approval, setApproval] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function run(kind: "summary" | "pay" | "recover") {
    if (inFlight.current) return; inFlight.current = true; setBusy(true); setError("");
    try {
      if (kind === "summary") {
        setOpen(true);
        const r = await marketplaceCheckoutAction({ listingId });
        if (!alive.current) return;
        if (!r.ok) { setError(r.message); return; } setPurchase(r.data);
        if (r.data.projectId) router.push(`/projects/${r.data.projectId}`);
      } else if (purchase) {
        if (kind === "pay") {
          const r = await createMarketplaceOrderAction({ purchaseId: purchase.id });
          if (!alive.current) return;
          if (!r.ok) { setError(r.message); return; }
          setPurchase(r.data.purchase); setApproval(r.data.approvalUrl);
          if (r.data.purchase.projectId) router.push(`/projects/${r.data.purchase.projectId}`);
          else if (r.data.approvalUrl) window.location.assign(r.data.approvalUrl);
        } else {
          const r = await recoverMarketplacePurchaseAction({ purchaseId: purchase.id });
          if (!alive.current) return;
          if (!r.ok) { setError(r.message); return; } setPurchase(r.data);
          if (r.data.projectId) router.push(`/projects/${r.data.projectId}`);
        }
      }
    } catch { if (alive.current) setError("Check your saved Marketplace purchases before starting another checkout."); }
    finally { if (alive.current) setBusy(false); inFlight.current = false; }
  }
  return <><Button className="w-full" disabled={busy} onClick={() => void run("summary")}>Adopt with PayPal Sandbox</Button><Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogTitle>Adopt this creator template</DialogTitle><DialogDescription>Sandbox payment unlocks one adopted template project. It does not include future AI generation usage.</DialogDescription>{purchase && <div className="space-y-3"><p className="break-words font-semibold">{purchase.title}</p><p>Template price: {usd(purchase.amountMinor)} USD</p><p className="text-body-sm text-muted-foreground">{estimate ? `Estimated AI generation: ~${estimate.credits} Sceenyk credits${estimate.test ? " (test pricing)" : ""}` : "AI generation cost: review in your project"}</p><p className="text-caption text-muted-foreground">This saved checkout retains its reviewed price. No AI credits are purchased or consumed.</p><Button className="w-full" disabled={busy || purchase.status === "failed"} onClick={() => void run(purchase.status === "completed" ? "recover" : "pay")}>{busy ? "Checking purchase…" : purchase.status === "completed" ? "Open adopted project" : "Pay with PayPal Sandbox"}</Button>{approval && <a className="nav-link block text-link" href={approval}>Continue to PayPal Sandbox</a>}<Button variant="outline" className="w-full" disabled={busy} onClick={() => void run("recover")}>Check saved purchase</Button></div>}<p role="status" className="text-body-sm text-destructive">{error || (!purchase && busy ? "Loading payment summary…" : "")}</p><Link className="nav-link text-link" href="/marketplace/purchases">My Marketplace purchases</Link></DialogContent></Dialog></>;
}
