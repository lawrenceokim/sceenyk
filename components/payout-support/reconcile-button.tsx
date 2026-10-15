"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function ReconcilePayoutButton({ withdrawalId, disabled = false }: { withdrawalId: string; disabled?: boolean }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function check() {
    if (inFlight.current || disabled) return;
    inFlight.current = true; setBusy(true); setMessage("Checking PayPal status…");
    try {
      const response = await fetch("/api/admin/payouts/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ withdrawalId }), cache: "no-store" });
      const data: unknown = await response.json();
      setMessage(data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : "Payout status couldn’t be checked.");
      router.refresh();
    } catch { setMessage("Payout status couldn’t be checked. Refresh before checking again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="space-y-3"><Button disabled={busy || disabled} onClick={() => void check()}>{busy ? "Checking…" : "Check PayPal Status"}</Button><p role="status" aria-live="polite" className="text-body-sm text-muted-foreground">{message}</p></div>;
}
