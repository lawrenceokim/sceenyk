"use client";

import { Suspense, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useAuthAvailable } from "./auth-availability";

function ModalReturn() {
  const params = useSearchParams();
  const intent = params.get("auth");
  const { isLoaded, isSignedIn } = useAuth();
  const { openSignIn, openSignUp } = useClerk();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded || (intent !== "sign-in" && intent !== "sign-up")) return;
    if (handled.current === intent) return;
    handled.current = intent;
    // Consume the marker so dismissing the modal or refreshing does not reopen it.
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    window.history.replaceState(null, "", url);
    if (isSignedIn) {
      window.location.replace("/dashboard");
      return;
    }
    if (intent === "sign-up") openSignUp();
    else openSignIn();
  }, [intent, isLoaded, isSignedIn, openSignIn, openSignUp]);

  useEffect(() => {
    if (!intent) handled.current = null;
  }, [intent]);
  return null;
}

function UnavailableReturn() {
  const params = useSearchParams();
  if (params.get("auth") !== "sign-in" && params.get("auth") !== "sign-up")
    return null;
  return (
    <p
      role="status"
      className="border-b border-border bg-accent px-6 py-3 text-center text-body-sm text-accent-foreground"
    >
      Sign in is temporarily unavailable. You can still explore Sceenyk and the
      creation workspace.
    </p>
  );
}

export function AuthModalReturn() {
  const available = useAuthAvailable();
  return (
    <Suspense fallback={null}>
      {available ? <ModalReturn /> : <UnavailableReturn />}
    </Suspense>
  );
}
