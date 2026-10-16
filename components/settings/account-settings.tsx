"use client";

import { useClerk, useUser, UserAvatar } from "@clerk/nextjs";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function AccountSettings({ clerkUserId, security = false }: { clerkUserId: string; security?: boolean }) {
  const { user, isLoaded } = useUser();
  const clerk = useClerk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const running = useRef(false);
  async function manageAccount() {
    if (!user || user.id !== clerkUserId || running.current) return;
    running.current = true; setBusy(true); setError("");
    try {
      const refreshed = await user.reload();
      if (refreshed.id !== clerkUserId || clerk.user?.id !== clerkUserId || refreshed.deleteSelfEnabled) throw new Error("ACCOUNT_UNAVAILABLE");
      clerk.openUserProfile();
    } catch { setError("Account controls are temporarily unavailable. Reopen Settings and try again."); }
    finally { running.current = false; setBusy(false); }
  }
  if (!isLoaded) return <p role="status">Loading your account…</p>;
  if (!user || user.id !== clerkUserId) return <p role="status">Reopen Settings to view your current account.</p>;
  return <div className="sceenyk-card space-y-5 p-5 sm:p-6">
    {!security && <div className="flex min-w-0 items-center gap-4"><UserAvatar /><dl className="min-w-0 space-y-1"><dt className="sr-only">Name</dt><dd className="break-words font-semibold">{user.fullName || "Your account"}</dd><dt className="sr-only">Primary email</dt><dd className="break-all text-body-sm text-muted-foreground">{user.primaryEmailAddress?.emailAddress || "No primary email"}</dd></dl></div>}
    <p className="text-body-sm text-muted-foreground">{security ? "Manage your password, connected accounts and active devices using Clerk’s secure account controls. Available options depend on your sign-in method." : "Your account name, avatar and email are managed securely by Clerk. Your public Marketplace profile is managed separately."}</p>
    <div className="flex flex-wrap gap-3"><Button disabled={busy} onClick={() => void manageAccount()}>{busy ? "Opening…" : `Manage ${security ? "security & sessions" : "account"}`}</Button><Button variant="outline" onClick={() => void clerk.signOut({ redirectUrl: "/" })}>Sign out</Button></div><p role="status" className="text-body-sm text-destructive">{error}</p>
  </div>;
}
