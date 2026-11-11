"use client";

import { useState } from "react";
import { AppNotification } from "@/components/notifications/app-notification";
import { CreditTopUp } from "@/components/payments/credit-top-up";

export type StudioActionNotice = { id: number; message: string; target: HTMLElement; credits?: { required: number; available: number } };

export function StudioActionNotice({ notice, onDismiss }: {
  notice: StudioActionNotice;
  onDismiss: () => void;
}) {
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  return <AppNotification noticeKey={`studio:${notice.id}:${notice.message}`} duration={checkoutOpen ? 0 : 7000} onDismiss={onDismiss}>
    <p>{notice.message}</p>
    {notice.credits && <p className="text-xs text-muted-foreground">{notice.credits.available} available · {notice.credits.required} required</p>}
    {notice.credits && <CreditTopUp label="Buy Credits" onOpenChange={setCheckoutOpen} />}
  </AppNotification>;
}
