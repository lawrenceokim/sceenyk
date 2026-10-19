"use client";

import type { ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";

export function TemplateAccountBoundary({ clerkUserId, children }: { clerkUserId: string; children: ReactNode }) {
  return useAuthAvailable() ? <AccountTemplate clerkUserId={clerkUserId}>{children}</AccountTemplate> : <p>Sign in is temporarily unavailable.</p>;
}
function AccountTemplate({ clerkUserId, children }: { clerkUserId: string; children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status">Opening your template…</p>;
  if (userId !== clerkUserId) return <AccountAction intent="sign-in">Sign in to view your template</AccountAction>;
  return children;
}
