"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { clearNotices, dismissNotice, notify, readNotices, subscribeNotices } from "@/lib/notifications/store";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AppNotification } from "./app-notification";
import { mountNotificationViewport } from "./notification-viewport";

const noEvents: ReturnType<typeof readNotices> = [];
function AccountNoticeBoundary() {
  const { isLoaded, userId, sessionId } = useAuth();
  const previous = useRef<string | null | undefined>(undefined);
  const scope = userId && sessionId ? `${userId}/${sessionId}` : null;
  useLayoutEffect(() => {
    if (!isLoaded) return;
    if (previous.current !== undefined && previous.current !== scope) clearNotices();
    previous.current = scope;
  }, [isLoaded, scope]);
  return null;
}
export function NotificationHost() {
  const configured = useAuthAvailable();
  const events = useSyncExternalStore(subscribeNotices, readNotices, () => noEvents);
  useEffect(() => {
    const release = mountNotificationViewport();
    let validating = false;
    const invalid = (event: Event) => {
      const control = event.target;
      if (!(control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement)) return;
      event.preventDefault();
      if (validating) return;
      validating = true;
      const label = control.labels?.[0]?.textContent?.trim();
      notify(label ? `${label}: ${control.validationMessage}` : control.validationMessage, "error");
      control.focus(); requestAnimationFrame(() => { validating = false; });
    };
    document.addEventListener("invalid", invalid, true);
    return () => { document.removeEventListener("invalid", invalid, true); release(); };
  }, []);
  return <>
    {configured && <AccountNoticeBoundary />}
    {events.map(event => <AppNotification key={event.id} noticeKey={`event:${event.id}`} tone={event.tone}
      onDismiss={() => dismissNotice(event.id)}>{event.message}</AppNotification>)}
  </>;
}
