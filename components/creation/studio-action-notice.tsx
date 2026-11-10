"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreditTopUp } from "@/components/payments/credit-top-up";

export type StudioActionNotice = { id: number; message: string; target: HTMLElement; credits?: { required: number; available: number } };

export function StudioActionNotice({ notice, onDismiss }: {
  notice: StudioActionNotice;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  useEffect(() => {
    if (paused || checkoutOpen) return;
    const timer = setTimeout(onDismiss, 7000);
    return () => clearTimeout(timer);
  }, [notice.id, onDismiss, paused, checkoutOpen]);

  return createPortal(
    <div data-checkout-open={checkoutOpen} className="fixed top-4 right-4 z-[90] flex w-[calc(100%_-_2rem)] max-w-sm items-start gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-right-4 [animation-duration:var(--motion-popover)] [animation-timing-function:var(--motion-ease)] motion-reduce:animate-none data-[checkout-open=true]:z-40"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)} onBlurCapture={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false);
      }}>
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 space-y-2">
        <div role="status" aria-live="polite" aria-atomic="true" className="space-y-1 text-sm leading-relaxed">
          <p>{notice.message}</p>
          {notice.credits && <p className="text-xs text-muted-foreground">{notice.credits.available} available · {notice.credits.required} required</p>}
        </div>
        {notice.credits && <CreditTopUp label="Buy Credits" onOpenChange={setCheckoutOpen} />}
      </div>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss notification" onClick={onDismiss}><X aria-hidden="true" /></Button>
    </div>, notice.target,
  );
}
