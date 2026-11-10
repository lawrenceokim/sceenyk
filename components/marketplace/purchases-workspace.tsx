import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Store } from "lucide-react";

export function PurchasesWorkspace({ children }: { children: ReactNode }) {
  return <div className="relative isolate min-w-0 space-y-6 pb-4 sm:space-y-7">
    <Image src="/images/marketplace/purchases-glow.svg" alt="" aria-hidden="true" width={1000} height={380}
      className="pointer-events-none absolute -top-12 right-0 -z-10 h-auto w-full max-w-[1000px] opacity-50 dark:opacity-80" />
    <header className="flex min-w-0 items-start gap-3.5 sm:items-center sm:gap-4">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-[14px] border border-primary/30 bg-linear-to-br from-primary/25 to-primary/[0.04] text-primary shadow-sm sm:size-12"><Store aria-hidden="true" className="size-6" /></span>
      <div className="min-w-0 space-y-2">
        <h1 className="[&&&&]:text-[25px] [&&&&]:leading-8 font-semibold tracking-tight sm:[&&&&]:text-[30px] sm:[&&&&]:leading-9">My Marketplace purchases</h1>
        <p className="text-[13px] leading-5 text-muted-foreground sm:text-sm">Review your purchases and reopen adopted projects.</p>
      </div>
    </header>
    <nav aria-label="Marketplace account navigation" className="flex flex-wrap gap-x-7 border-b border-border text-[13px] font-medium">
      <Link href="/settings/templates" className="-mb-px flex min-h-11 items-center border-b-2 border-primary pb-2 text-link outline-none focus-visible:ring-2 focus-visible:ring-ring">My Marketplace Listings</Link>
      <Link href="/credits/earnings" className="-mb-px flex min-h-11 items-center border-b-2 border-transparent pb-2 text-link outline-none hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring">Creator earnings</Link>
    </nav>
    {children}
  </div>;
}
