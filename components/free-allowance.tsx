"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect } from "react";
import { useAccountQuery } from "@/components/cache/use-account-query";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { AppNotification } from "@/components/notifications/app-notification";


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
  const query = useAccountQuery("allowance", 1, { enabled: signedIn });
  const { refresh } = query;
  const allowance = query.data ?? null, error = query.error ? "Free allowance couldn’t be refreshed." : "";
  useEffect(() => { if (signedIn && refreshKey) void refresh(true).catch(() => {}); }, [signedIn, refreshKey, refresh]);
  const remaining = allowance?.available;
  const label = !signedIn
    ? "Sign in for your free allowance"
    : error
      ? "Free allowance unavailable"
      : !allowance
        ? "Loading free allowance…"
        : allowance.reviewRequired
          ? "Free videos remaining: unavailable"
        : remaining === 0
          ? "No free videos remaining"
          : `Free videos remaining: ${remaining}`;
  if (presentation) return <div className="grid min-w-0 gap-1">
    <div role="status" aria-live="polite" className={presentation === "billing-balance" ? "text-[22px] leading-7 font-semibold tabular-nums text-foreground" : "text-[14px] leading-5 font-semibold text-foreground"}>
      {signedIn && !allowance && !error ? <Skeleton className="h-5 w-20 max-w-full" /> : allowance && !allowance.reviewRequired
        ? presentation === "billing-balance" ? `${allowance.available} / ${allowance.total}` : `Free videos remaining: ${allowance.available}`
        : label}
    </div>
    {allowance && allowance.reserved > 0 && <span className="text-xs text-muted-foreground">{allowance.reserved} reserved in progress</span>}
    {allowance?.reviewRequired && <span className="text-xs text-muted-foreground">Use credits for AI generation.</span>}
    {error && <><AppNotification tone="error">{error}</AppNotification><Button type="button" variant="outline" size="sm" onClick={() => void query.retry().catch(() => {})}>Check allowance</Button></>}
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
        2 lifetime free video projects, including reference and Storyboard regenerations. Each includes one 5-second, 480p video.
      </p>
      <p>Additional projects use purchased credits.</p></>}
      {allowance?.reviewRequired && <p>Use credits for AI generation.</p>}
      {signedIn && error && (
        <>
          <AppNotification role="alert" className="text-destructive">{error}</AppNotification>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void query.retry().catch(() => {})}
          >
            Check allowance
          </Button>
        </>
      )}
    </div>
  );
}
