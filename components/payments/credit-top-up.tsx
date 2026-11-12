"use client";

import { useEffect, useState } from "react";
import { creditCheckoutAction } from "@/app/actions/payments";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreditPurchases } from "./credit-purchases";
import { FreeAllowanceSummary } from "@/components/free-allowance";
import { notifyCreditsChanged } from "@/lib/accounting/client-events";
import { CreditAccountSkeleton } from "./financial-skeletons";
import { AppNotification } from "@/components/notifications/app-notification";


type CheckoutData = Extract<Awaited<ReturnType<typeof creditCheckoutAction>>, { ok: true }>["data"];

export function CreditTopUp({ label = "Top up credits", onOpenChange }: { label?: string; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={next => {
    setOpen(next);
    onOpenChange?.(next);
    if (!next) notifyCreditsChanged();
  }}>
    <DialogTrigger render={<Button type="button" variant="outline" />}>{label}</DialogTrigger>
    <DialogContent className="scrollbar-hidden sm:max-w-3xl">
      <DialogTitle className="pr-8 text-xl font-semibold">Buy credits</DialogTitle>
      <DialogDescription>Choose a custom USD amount and review the credits after estimated fees. Checkout opens in a separate tab so your current draft stays here.</DialogDescription>
      {open && <CheckoutOptions />}
    </DialogContent>
  </Dialog>;
}

function CheckoutOptions() {
  const [options, setOptions] = useState<CheckoutData | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    creditCheckoutAction().then(result => {
      if (!active) return;
      if (result.ok) { setOptions(result.data); setError(false); }
      else setError(true);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [revision]);
  return options ? <>
    <CreditPurchases {...options} checkoutInNewTab />
    <FreeAllowanceSummary />
  </> : error ? <AppNotification role="alert" className="space-y-3">
    <p>Credit pricing couldn’t be loaded.</p>
    <Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>Reload credit pricing</Button>
  </AppNotification> : <CreditAccountSkeleton />;
}
