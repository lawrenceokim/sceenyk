"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { creditSummaryAction } from "@/app/actions/payments";
import { creditRefreshKey } from "@/lib/accounting/client-events";

export function CreditBalance({ compact = false }: { compact?: boolean }) {
  const configured = useAuthAvailable();
  return configured ? <AccountBalance compact={compact} /> : <span>—</span>;
}

function AccountBalance({ compact }: { compact: boolean }) {
  const { userId, isLoaded, isSignedIn } = useAuth();
  return isLoaded && isSignedIn ? <BalanceRead key={userId} compact={compact} /> : compact ? null : <span>—</span>;
}

function BalanceRead({ compact }: { compact: boolean }) {
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
  return compact ? <Link href="/settings/credits" className="nav-link flex flex-wrap gap-x-2 text-caption" aria-label={`Paid credits: ${balance}. Buy credits`}>
    <span aria-live="polite">Paid credits: {balance}</span>
    {summary?.lowBalance && <span className="text-warning-foreground">Low balance</span>}
  </Link> : <span aria-live="polite">{balance}</span>;
}
