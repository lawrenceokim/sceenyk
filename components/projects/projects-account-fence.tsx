"use client";

import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";

export function ProjectsAccountFence({ clerkUserId, children }: { clerkUserId: string; children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  if (!isLoaded) return <p role="status" className="text-muted-foreground">Opening your projects…</p>;
  if (userId !== clerkUserId) return <p role="status" className="text-muted-foreground">Reopen Projects for your current account.</p>;
  return children;
}
