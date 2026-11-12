"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import { AppNotification } from "@/components/notifications/app-notification";


export function PurchasesRetryButton({ onRetry }: { onRetry?: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return <Button variant="outline" disabled={pending} onClick={() => startTransition(() => onRetry ? onRetry() : router.refresh())} className="h-auto min-h-10 px-3 py-2 text-xs">{pending ? "Retrying…" : "Try again"}</Button>;
}

export function PurchasesBoundary(props: { clerkUserId: string; children: ReactNode; fallback: ReactNode }) {
  return useAuthAvailable() ? <AccountPurchases {...props} /> : <AppNotification className="text-sm text-muted-foreground">Sign in is temporarily unavailable.</AppNotification>;
}
function AccountPurchases({ clerkUserId, children, fallback }: { clerkUserId: string; children: ReactNode; fallback: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return fallback;
  if (userId !== clerkUserId) return <AccountAction intent="sign-in">Sign in to view your purchases</AccountAction>;
  return children;
}
