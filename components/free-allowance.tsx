"use client";
import { creditRefreshKey } from "@/lib/accounting/client-events";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { freeAllowanceAction } from "@/app/actions/accounting";
import type { FreeAllowance } from "@/lib/accounting/types";
import { Button } from "@/components/ui/button";
import { useAuthAvailable } from "@/components/auth/auth-availability";

type AllowanceProps = {
  signedIn?: boolean;
  refreshKey?: string;
  compact?: boolean;
  presentation?: "billing-balance" | "billing-footer";
};

export function FreeAllowanceSummary(props: AllowanceProps) {
  const configured = useAuthAvailable();
  return configured ? (
    <AccountAllowance {...props} />
  ) : (
    <AllowanceRead signedIn={false} compact={props.compact} presentation={props.presentation} />
  );
}

function AccountAllowance({ signedIn = true, refreshKey, compact, presentation }: AllowanceProps) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  return (
    <AllowanceRead
      key={userId ?? "visitor"}
      signedIn={signedIn && isLoaded && !!isSignedIn}
      refreshKey={refreshKey}
      compact={compact}
      presentation={presentation}
    />
  );
}

function AllowanceRead({ signedIn = false, refreshKey = "", compact = false, presentation }: AllowanceProps) {
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
    const storage = (event: StorageEvent) => { if (event.key === creditRefreshKey) reload(); };
    reload();
    window.addEventListener("storage", storage);
    window.addEventListener("sceenyk:credits", reload);
    window.addEventListener("pageshow", reload);
    window.addEventListener("sceenyk:allowance", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.removeEventListener("storage", storage);
      window.removeEventListener("sceenyk:credits", reload);
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
        : allowance.reviewRequired
          ? "Free AI projects remaining: under review"
        : remaining === 0
          ? "No free AI projects remaining"
          : `Free AI projects remaining: ${remaining}`;
  if (presentation) return <div className="grid min-w-0 gap-1">
    <div role="status" aria-live="polite" className={presentation === "billing-balance" ? "text-[22px] leading-7 font-semibold tabular-nums text-foreground" : "text-[14px] leading-5 font-semibold text-foreground"}>
      {signedIn && !allowance && !error ? <Skeleton className="h-5 w-20 max-w-full" /> : allowance && !allowance.reviewRequired
        ? presentation === "billing-balance" ? `${allowance.available} / ${allowance.total}` : `Free AI projects remaining: ${allowance.available}`
        : label}
    </div>
    {allowance && allowance.reserved > 0 && <span className="text-xs text-muted-foreground">{allowance.reserved} reserved in progress</span>}
    {allowance?.reviewRequired && <span className="text-xs text-muted-foreground">Historical AI usage needs review. Saved work remains available.</span>}
    {error && <Button type="button" variant="outline" size="sm" onClick={() => setRevision(current => current + 1)}>Check allowance</Button>}
  </div>;
  return (
    <div className="space-y-2 text-caption leading-relaxed text-muted-foreground">
      <p role="status" aria-live="polite" className="font-medium text-foreground">
        {signedIn && !allowance && !error ? <Skeleton className="h-4 w-44 max-w-full" /> : label}
      </p>
      {signedIn && allowance && !error && allowance.reserved > 0 && (
        <p>{allowance.reserved} reserved for AI projects in progress.</p>
      )}
      {!compact && <><p>
        2 lifetime free AI-powered projects. The first AI feature uses one allowance. Each project has one 5-second, 480p video within a $1.03 Higgsfield budget. OpenAI usage is platform-funded and attempt-limited.
      </p>
      <p>Sandbox credit purchases are available. Paid generations require configured credit rates.</p></>}
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
