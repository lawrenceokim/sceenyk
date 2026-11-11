import Image from "next/image";
import Link from "next/link";
import { Coins, Layers, RefreshCw, RotateCcw, Shield, Store, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usd, type CreatorEarnings } from "@/lib/marketplace/payments/contract";
import type { WithdrawalAccount } from "@/lib/marketplace/withdrawals/contract";
import { EarningsCard, EarningsEmptyState, EarningsIcon } from "./earnings-ui";
import { EarningsHistory } from "./earnings-history";
import { WithdrawalPanel } from "./withdrawal-panel";
import { MarketplacePagination } from "./pagination";
import { AppNotification } from "@/components/notifications/app-notification";


type Props = { earnings: CreatorEarnings; account?: WithdrawalAccount; page: number; clerkUserId: string; busy: boolean; error: string; message: string; onRefresh: () => Promise<void> };

export function EarningsDashboard({ earnings, account, page, clerkUserId, busy, error, message, onRefresh }: Props) {
  const available = account?.available ?? earnings.available;
  const summaryMetrics = [["Pending Payouts", account?.pending], ["Total Paid Out", account?.paid], ["Lifetime Gross Sales", earnings.lifetimeGross]] as const;
  const secondaryMetrics = [["Pending Earnings", earnings.pending, Wallet], ["Available Earnings", available, Layers], ["Creator Net Reversed", earnings.reversedNet, RotateCcw], ["Platform Fees Reversed", earnings.reversedFee, Shield]] as const;
  const sales = <EarningsCard label="Marketplace Sales" className="grid content-start gap-3">
    <div className="flex items-center gap-3"><EarningsIcon small><Store /></EarningsIcon><h2>Marketplace Sales</h2></div>
    {earnings.sales.length ? <EarningsHistory earnings={{ ...earnings, available }} /> : earnings.total === 0 ? <EarningsEmptyState kind="sales" /> : <p className="text-muted-foreground">No Marketplace sales on this page.</p>}
    {(earnings.total > 0 || page > 1) && <MarketplacePagination total={earnings.total} page={page} pageSize={12} itemLabel="sale" href={value => `/credits/earnings?page=${value}`} />}
  </EarningsCard>;
  return <div className="@container/earnings grid min-w-0 gap-4 text-[13px] leading-5 text-foreground [&&&_p]:text-[12px] [&&&_p]:leading-[18px] [&&&_h2]:text-[13px] [&&&_h2]:leading-5 [&&&_h2]:font-semibold [&&&_section>*+*]:mt-0 [&&&_label]:text-xs [&&&_label]:leading-[18px] [&&&_input]:h-8 [&&&_input]:min-h-8 [&&&_input]:pl-9 [&&&_input]:text-xs [&&&_[data-slot=button]]:min-h-7 [&&&_[data-slot=button]]:rounded-md [&&&_[data-slot=button]]:px-3 [&&&_[data-slot=button]]:py-1 [&&&_[data-slot=button]]:text-[11px] [&&&_[data-slot=button]]:leading-[18px] [&&&_[data-slot=button]_svg]:size-3.5 [@media(pointer:coarse)]:[&&&_[data-slot=button]]:min-h-11 [@media(pointer:coarse)]:[&&&_input]:min-h-11">
    <section aria-label="Earnings summary" className="relative isolate overflow-hidden rounded-[14px] border border-primary/25 bg-linear-to-r from-primary/[0.025] to-primary/[0.07] p-5 @min-[960px]/earnings:pr-44">
      <div aria-hidden="true" className="pointer-events-none absolute -right-14 -bottom-32 -z-10 size-72 rounded-full bg-primary/[0.04]" />
      <Image src="/images/billing/credits-wallet.png" alt="" aria-hidden="true" width={480} height={320} sizes="160px" className="pointer-events-none absolute right-3 bottom-0 hidden h-auto w-40 opacity-65 dark:opacity-75 @min-[960px]/earnings:block" />
      <dl className="grid grid-cols-1 gap-4 @min-[340px]/earnings:grid-cols-2 @min-[720px]/earnings:grid-cols-[1.3fr_1fr_1fr_1.1fr] @min-[720px]/earnings:gap-0">
        <div className="flex min-w-0 items-center gap-3 @min-[720px]/earnings:pr-4"><EarningsIcon><Coins /></EarningsIcon><div className="grid gap-1"><dt className="text-xs text-muted-foreground">Available Earnings</dt><dd className="[&&&&]:text-xl [&&&&]:leading-7 font-semibold tabular-nums text-link">{usd(available)}</dd></div></div>
        {summaryMetrics.map(([label, value]) => <div key={label} className="grid min-w-0 content-center gap-1 @min-[720px]/earnings:border-l @min-[720px]/earnings:border-primary/20 @min-[720px]/earnings:pl-5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="[&&&&]:text-lg [&&&&]:leading-6 font-semibold tabular-nums">{typeof value === "number" ? usd(value) : "—"}</dd></div>)}
      </dl>
    </section>
    <div className="grid gap-3 @min-[360px]/earnings:grid-cols-2 @min-[760px]/earnings:grid-cols-4">
      {secondaryMetrics.map(([label, value, Icon]) => {
        return <EarningsCard key={label} label={label} className="flex items-center gap-3"><EarningsIcon><Icon /></EarningsIcon><dl className="grid min-w-0 gap-1"><dt className="text-[11px] leading-4 text-muted-foreground">{label}</dt><dd className="[&&&&]:text-base [&&&&]:leading-6 font-semibold tabular-nums">{usd(value)}</dd></dl></EarningsCard>;
      })}
    </div>
    {error && <AppNotification role="alert" className="rounded-lg bg-destructive-surface p-3 text-destructive">{error}</AppNotification>}
    {message && <AppNotification role="status" className="text-muted-foreground">{message}</AppNotification>}
    {account ? <WithdrawalPanel account={account} page={page} clerkUserId={clerkUserId} onChanged={onRefresh} marketplaceSales={sales} /> : <><AppNotification role="status" className="rounded-lg border border-border p-4 text-muted-foreground">Your payout account couldn’t be loaded. Refresh earnings to try again.</AppNotification>{sales}</>}
    <footer className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
      <Button variant="ghost" size="sm" disabled={busy} onClick={() => void onRefresh()}><RefreshCw className={busy ? "motion-safe:animate-spin" : ""} aria-hidden="true" />{busy ? "Checking…" : "Refresh earnings"}</Button>
      <Link href="/settings/templates" className="rounded hover:text-link focus-visible:outline-2 focus-visible:outline-ring">My Marketplace Listings</Link>
      <Link href="/marketplace/purchases" className="rounded hover:text-link focus-visible:outline-2 focus-visible:outline-ring">My Marketplace purchases</Link>
    </footer>
  </div>;
}
