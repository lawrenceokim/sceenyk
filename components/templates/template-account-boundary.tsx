"use client";
import { TemplateDetailSkeleton } from "@/components/marketplace/detail-skeletons";

import type { ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AccountAction } from "@/components/account-action";

export function TemplateAccountBoundary({ clerkUserId, children, fallback }: { clerkUserId: string; children: ReactNode; fallback?: ReactNode }) {
  return useAuthAvailable() ? <AccountTemplate clerkUserId={clerkUserId} fallback={fallback}>{children}</AccountTemplate> : <p>Sign in is temporarily unavailable.</p>;
}
function AccountTemplate({ clerkUserId, children, fallback }: { clerkUserId: string; children: ReactNode; fallback?: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return fallback ?? <TemplateDetailSkeleton owned />;
  if (userId !== clerkUserId) return <AccountAction intent="sign-in">Sign in to view your template</AccountAction>;
  return children;
}
