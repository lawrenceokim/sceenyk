"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { creditBalanceAction } from "@/app/actions/payments";

export function CreditBalance() {
  const configured = useAuthAvailable();
  return configured ? <AccountBalance /> : <span>—</span>;
}

function AccountBalance() {
  const { userId, isLoaded, isSignedIn } = useAuth();
  return isLoaded && isSignedIn ? <BalanceRead key={userId} /> : <span>—</span>;
}

function BalanceRead() {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    let active = true, sequence = 0;
    const reload = () => {
      if (document.visibilityState === "hidden") return;
      const request = ++sequence;
      creditBalanceAction().then(result => {
        if (active && request === sequence) setBalance(result.ok ? result.data : null);
      }).catch(() => { if (active && request === sequence) setBalance(null); });
    };
    reload();
    window.addEventListener("sceenyk:credits", reload);
    window.addEventListener("pageshow", reload);
    document.addEventListener("visibilitychange", reload);
    return () => {
      active = false;
      window.removeEventListener("sceenyk:credits", reload);
      window.removeEventListener("pageshow", reload);
      document.removeEventListener("visibilitychange", reload);
    };
  }, []);
  return <span aria-live="polite">{balance === null ? "—" : balance.toLocaleString()}</span>;
}
