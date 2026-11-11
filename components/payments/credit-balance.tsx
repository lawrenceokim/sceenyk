"use client";
import { Skeleton } from "@/components/ui/skeleton";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { creditSummaryAction } from "@/app/actions/payments";
import { creditRefreshKey } from "@/lib/accounting/client-events";
import { generationCreditsFromMicrousd } from "@/lib/payments/credit-pricing";
import { CreditTopUp } from "./credit-top-up";
import { AppNotification } from "@/components/notifications/app-notification";


export function GenerationCreditEstimate({ costMicrousd }: { costMicrousd: number | null }) {
  const configured = useAuthAvailable();
  if (costMicrousd === null) return <AppNotification className="text-xs text-muted-foreground">Generation credit estimate unavailable.</AppNotification>;
  const requiredCredits = generationCreditsFromMicrousd(costMicrousd);
  return <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-xs">
    <p>Estimated paid generation requirement: <strong>{requiredCredits.toLocaleString()} credits</strong>.</p>
    {configured && <AccountBalance compact requiredCredits={requiredCredits} />}
  </div>;
}

export function CreditBalance({ compact = false }: { compact?: boolean }) {
  const configured = useAuthAvailable();
  return configured ? <AccountBalance compact={compact} /> : <span>—</span>;
}

function AccountBalance({ compact, requiredCredits }: { compact: boolean; requiredCredits?: number }) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  return isLoaded && isSignedIn ? <BalanceRead key={userId} compact={compact} requiredCredits={requiredCredits} /> : compact ? null : <span>—</span>;
}

function BalanceRead({ compact, requiredCredits }: { compact: boolean; requiredCredits?: number }) {
  const [summary, setSummary] = useState<{ available: number; lowBalance: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true, sequence = 0;
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      const request = ++sequence;
      creditSummaryAction().then(result => {
        if (active && request === sequence) { setSummary(result.ok ? result.data : null); setLoaded(true); }
      }).catch(() => { if (active && request === sequence) { setSummary(null); setLoaded(true); } });
    };
    const storage = (event: StorageEvent) => { if (event.key === creditRefreshKey) reload(); };
    reload();
    window.addEventListener("sceenyk:credits", reload);
    window.addEventListener("pageshow", reload);
    window.addEventListener("focus", reload);
    window.addEventListener("storage", storage);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.removeEventListener("sceenyk:credits", reload);
      window.removeEventListener("pageshow", reload);
      window.removeEventListener("focus", reload);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", reload);
    };
  }, []);
  const balance = summary?.available.toLocaleString() ?? (compact ? loaded ? "Unavailable" : "Loading…" : "—");
  return compact ? <><Link href="/credits" className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link flex flex-wrap gap-x-2
      text-caption [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `} aria-label={`Paid credits: ${balance}. Buy credits`}>
    <span aria-live="polite">Paid credits: {!loaded && !summary ? <Skeleton className="inline-block h-4 w-10 align-middle" /> : balance}</span>
  </Link>
    {summary?.lowBalance && <AppNotification tone="warning">Low paid credit balance. Top up when you need more.</AppNotification>}
    {requiredCredits !== undefined && summary && summary.available < requiredCredits && <>
      <AppNotification tone="warning">Insufficient paid credits. Free allowance stays separate.</AppNotification>
      <CreditTopUp />
    </>}
  </> : <span aria-live="polite">{!loaded && !summary ? <Skeleton className="inline-block h-4 w-10 align-middle" /> : balance}</span>;
}
