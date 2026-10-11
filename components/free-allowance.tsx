"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { freeAllowanceAction } from "@/app/actions/accounting";
import type { FreeAllowance } from "@/lib/accounting/types";
import { Button } from "@/components/ui/button";
import { useAuthAvailable } from "@/components/auth/auth-availability";

type AllowanceProps = {
  signedIn?: boolean;
  refreshKey?: string;
};

export function FreeAllowanceSummary(props: AllowanceProps) {
  const configured = useAuthAvailable();
  return configured ? (
    <AccountAllowance {...props} />
  ) : (
    <AllowanceRead signedIn={false} />
  );
}

function AccountAllowance({ signedIn = true, refreshKey }: AllowanceProps) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  return (
    <AllowanceRead
      key={userId ?? "visitor"}
      signedIn={signedIn && isLoaded && !!isSignedIn}
      refreshKey={refreshKey}
    />
  );
}

function AllowanceRead({ signedIn = false, refreshKey = "" }: AllowanceProps) {
  const [allowance, setAllowance] = useState<FreeAllowance | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!signedIn) return;
    let active = true;
    let sequence = 0;
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      const request = ++sequence;
      freeAllowanceAction()
        .then((result) => {
          if (!active || request !== sequence) return;
          if (result.ok) {
            setAllowance(result.value);
            setError("");
          } else {
            setAllowance(null);
            setError(result.message);
          }
        })
        .catch(() => {
          if (active && request === sequence) {
            setAllowance(null);
            setError("Free allowance couldn’t be loaded. Please try again.");
          }
        });
    };
    reload();
    window.addEventListener("pageshow", reload);
    window.addEventListener("sceenyk:allowance", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.removeEventListener("pageshow", reload);
      window.removeEventListener("sceenyk:allowance", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [signedIn, refreshKey, revision]);
  const remaining = allowance?.available;
  const label = !signedIn
    ? "Sign in for your free allowance"
    : error
      ? "Free allowance unavailable"
      : !allowance
        ? "Loading free allowance…"
        : remaining === 0
          ? "No free generations remaining"
          : `${remaining} free generation${remaining === 1 ? "" : "s"} remaining`;
  return (
    <div className="space-y-2 text-caption leading-relaxed text-muted-foreground">
      <p role="status" aria-live="polite" className="font-medium text-foreground">
        {label}
      </p>
      {signedIn && allowance && !error && allowance.reserved > 0 && (
        <p>{allowance.reserved} reserved for generation in progress.</p>
      )}
      <p>
        2 lifetime free video generations, up to 10 seconds each. Failed
        generations restore the reserved allowance.
      </p>
      <p>Paid access for additional or longer generations is coming later.</p>
      {signedIn && error && (
        <>
          <p role="alert" className="text-destructive">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRevision((current) => current + 1)}
          >
            Check allowance
          </Button>
        </>
      )}
    </div>
  );
}
