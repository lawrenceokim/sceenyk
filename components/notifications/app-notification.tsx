"use client";

import { Children, isValidElement, useEffect, useId, useState, useSyncExternalStore, type HTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notificationRegistry, type NoticeTone } from "@/lib/notifications/store";
import { mountNotificationViewport, readViewport, subscribeViewport } from "./notification-viewport";

export function notificationText(children: ReactNode): string {
  return Children.toArray(children).map(child => typeof child === "string" || typeof child === "number" ? String(child)
    : isValidElement<{ children?: ReactNode }>(child) ? notificationText(child.props.children) : "").join(" ").replace(/\s+/g, " ").trim();
}
function interactive(children: ReactNode): boolean {
  return Children.toArray(children).some(child => isValidElement<{ children?: ReactNode; onClick?: unknown; href?: unknown }>(child) &&
    (!!child.props.onClick || !!child.props.href || interactive(child.props.children)));
}
const noViewport = () => null;
const hidden = () => false;

export function AppNotification({ children, role = "status", className = "", tone, duration, onDismiss, noticeKey, id, ...props }: HTMLAttributes<HTMLDivElement> & {
  tone?: NoticeTone; duration?: number; onDismiss?: () => void; noticeKey?: string;
}) {
  const instance = useId(), text = notificationText(children);
  const severity = tone ?? (className.includes("warning") ? "warning" : role === "alert" || className.includes("destructive") ? "error" : className.includes("success") ? "success" : "info");
  const key = noticeKey ?? `${severity}:${text || instance}`;
  const content = !!text || Children.toArray(children).some(child => isValidElement(child));
  const visible = useSyncExternalStore(notificationRegistry.subscribe, () => notificationRegistry.visible(instance, key), hidden);
  const target = useSyncExternalStore(subscribeViewport, readViewport, noViewport);
  const [hovered, setHovered] = useState(false), [focused, setFocused] = useState(false);
  const lifetime = duration ?? (interactive(children) ? 0 : severity === "error" ? 12_000 : 8000);
  useEffect(() => {
    if (!content) return;
    const unmount = mountNotificationViewport(), release = notificationRegistry.register(instance, key);
    return () => { release(); unmount(); };
  }, [instance, key, content]);
  useEffect(() => {
    if (!visible || !lifetime || hovered || focused) return;
    const timer = setTimeout(() => { notificationRegistry.dismiss(key); onDismiss?.(); }, lifetime);
    return () => clearTimeout(timer);
  }, [visible, lifetime, hovered, focused, key, onDismiss]);
  const Icon = severity === "error" ? CircleAlert : severity === "warning" ? TriangleAlert : severity === "success" ? CircleCheck : Info;
  return <>
    {id && content && <span id={id} className="sr-only">{text}</span>}
    {visible && target && createPortal(<div {...props} aria-live="off" data-notification-tone={severity}
      className="pointer-events-auto relative flex shrink-0 items-start gap-3 rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-lg animate-in fade-in slide-in-from-right-4 [animation-duration:var(--motion-popover)] [animation-timing-function:var(--motion-ease)] motion-reduce:animate-none"
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)}
      onClick={event => { event.stopPropagation(); props.onClick?.(event); }}
      onPointerDown={event => { event.stopPropagation(); props.onPointerDown?.(event); }}
      onKeyDown={event => { event.stopPropagation(); props.onKeyDown?.(event); }}
      onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}>
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${severity === "error" ? "text-destructive" : severity === "warning" ? "text-warning-foreground" : severity === "success" ? "text-success-foreground" : "text-primary"}`} />
      <div role={severity === "error" ? "alert" : "status"} aria-live={severity === "error" ? "assertive" : "polite"} aria-atomic="true"
        className="min-w-0 flex-1 space-y-2 break-words text-sm leading-relaxed [&_p]:m-0 [&_p+_p]:mt-1">{children}</div>
      <Button type="button" variant="ghost" size="icon-xs" aria-label="Dismiss notification" className="shrink-0 [@media(pointer:coarse)]:size-11"
        onClick={() => { notificationRegistry.dismiss(key); onDismiss?.(); }}><X aria-hidden="true" /></Button>
    </div>, target, instance)}
  </>;
}
