import type { ReactNode } from "react";
import Image from "next/image";

export function EarningsCard({ children, className = "", label }: { children: ReactNode; className?: string; label: string }) {
  return <section aria-label={label} className={`min-w-0 rounded-[14px] border border-border bg-card p-4 ${className}`}>{children}</section>;
}

export function EarningsIcon({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-xl bg-primary/[0.06] text-primary ${small ? "size-8 [&_svg]:size-4" : "size-11 [&_svg]:size-5"}`}>{children}</span>;
}

export function EarningsEmptyState({ kind }: { kind: "payout" | "sales" }) {
  const payout = kind === "payout";
  return <div className="grid justify-items-center gap-1 py-3 text-center">
    <Image src={payout ? "/images/billing/credits-wallet.png" : "/images/earnings/marketplace-sales.png"} alt="" aria-hidden="true" width={480} height={320} sizes="100px" className="h-auto w-25 opacity-65 dark:opacity-75" />
    <div className="text-[13px] leading-5 font-semibold text-foreground">{payout ? "No withdrawals yet" : "No Marketplace sales yet"}</div>
    <p className="text-muted-foreground">{payout ? "Your payout requests will appear here once you request a withdrawal." : "Your published listings and sales will appear here once you start earning."}</p>
  </div>;
}

export function PayPalMark() {
  return <svg viewBox="0 0 24 28" fill="none" aria-hidden="true">
    <path fill="#003087" d="M6 2h9c5 0 7 3 6 7-1 5-4 7-9 7h-2l-2 9H3L6 2Z" />
    <path fill="#009CDE" d="M11 8h6c5 0 6 3 5 7-1 4-4 6-8 6h-2l-1 6H6l3-16c0-2 1-3 2-3Z" />
    <path fill="#012169" d="M10 8h7l3 1c-1 5-4 7-9 7H9l1-8Z" />
  </svg>;
}
