"use client";

import Link from "next/link";
import { UserAvatar, UserButton, useAuth, useUser } from "@clerk/nextjs";
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
        variant="ghost"
        nativeButton={false}
        render={<Link href="/dashboard" onClick={onNavigate} />}
      >
        Dashboard
      </Button>
      <Button
        nativeButton={false}
        render={<Link href="/create" onClick={onNavigate} />}
      >
        Create <ArrowUpRight aria-hidden="true" />
      </Button>
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

export function DashboardUserButton() {
  return <UserButton userProfileMode="modal" />;
}

export function DashboardAccount({
  interactive = true,
}: {
  interactive?: boolean;
}) {
  const { user, isLoaded } = useUser();
  return (
    <div className="flex items-center gap-3 border-t border-sidebar-border p-5">
      {interactive ? <DashboardUserButton /> : <UserAvatar />}
      <div className="min-w-0">
        <p className="truncate text-body-sm font-medium">
          {isLoaded ? user?.firstName || "Your account" : "Your account"}
        </p>
        <p className="mt-1 text-caption text-muted-foreground">
          Manage your account
        </p>
      </div>
    </div>
  );
}

export function DashboardGreeting() {
  const { user } = useUser();
  return (
    <h1 className="mt-3 text-heading-2 font-bold tracking-tight md:text-heading-1">
      Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
    </h1>
  );
}
