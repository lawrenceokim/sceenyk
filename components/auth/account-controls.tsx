"use client";

import Link from "next/link";
import { UserButton, useAuth } from "@clerk/nextjs";
import { ArrowUpRight } from "lucide-react";
import { AccountAction } from "@/components/account-action";
import { Button } from "@/components/ui/button";
import { useAuthAvailable } from "./auth-availability";

function SignedOutActions() {
  // Keep mobile triggers visible while Clerk opens/restores modal focus.
  return (
    <>
      <AccountAction variant="ghost" intent="sign-in">
        Sign in
      </AccountAction>
      <AccountAction intent="sign-up">
        Get Started <ArrowUpRight aria-hidden="true" />
      </AccountAction>
    </>
  );
}

function ConfiguredActions({ onNavigate }: { onNavigate?: () => void }) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <span
        role="status"
        className="flex h-11 w-48 items-center justify-end gap-2"
        aria-label="Loading account"
      >
        <span className="h-9 w-28 rounded-lg bg-muted" />
        <span className="size-9 rounded-full bg-muted" />
      </span>
    );
  if (!isSignedIn) return <SignedOutActions />;
  return (
    <>
      <Button
        nativeButton={false}
        render={<Link href="/studio" onClick={onNavigate} />}
      >
        Studio <ArrowUpRight aria-hidden="true" />
      </Button>
      <Button variant="ghost" nativeButton={false} render={<Link href="/settings/account" onClick={onNavigate} />}>Settings</Button>
      <UserButton userProfileMode="modal" />
    </>
  );
}

export function AccountControls({ onNavigate }: { onNavigate?: () => void }) {
  const available = useAuthAvailable();
  return available ? (
    <ConfiguredActions onNavigate={onNavigate} />
  ) : (
    <SignedOutActions />
  );
}
