import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MarketplacePagination } from "@/components/marketplace/pagination";
import { usd } from "@/lib/marketplace/payments/contract";
import type { PayoutQueue, PayoutDetail } from "@/lib/payout-support/contract";
import { missingPayoutReferenceMessage } from "@/lib/payout-support/outcomes";
import { ReconcilePayoutButton } from "./reconcile-button";

const labels = { all: "All withdrawals", pending: "Pending", eligible: "Eligible", processing: "Processing", paid: "Paid", failed: "Failed", review: "Needs Review" };
const words = (value: string) => value.replaceAll("_", " ");
function When({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{new Date(value).toLocaleString("en-NG", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })} WAT</time> : <span>Unknown</span>;
}
function Status({ status, review }: { status: string; review: boolean }) {
  return <div className="flex flex-wrap gap-2"><span className="rounded-full bg-accent px-3 py-1 text-caption font-medium capitalize text-accent-foreground">{status}</span>{review && <span className="rounded-full bg-warning-surface px-3 py-1 text-caption font-medium text-warning-foreground">Needs Review</span>}</div>;
}
export function SupportUnavailable() {
  return <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-3 p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h1 className="text-xl font-semibold">Payout support is unavailable</h1><p role="alert" className="text-muted-foreground">Internal data couldn’t be loaded. Refresh before continuing.</p><Link className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link text-link
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `} href="/studio">Return to Studio</Link></section>;
}
export function PayoutQueueView({ data, query, status }: { data: PayoutQueue; query: string; status: keyof typeof labels }) {
  const href = (page: number) => `/admin/payouts?${new URLSearchParams({ query, status, page: String(page) })}`;
  return <div className="space-y-6">
    <header className="space-y-3"><p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>INTERNAL · PAYPAL SANDBOX</p><h1 className="text-3xl font-bold tracking-tight">Payout support</h1><p className="max-w-2xl text-muted-foreground">Review creator withdrawals and check their existing PayPal status. Automatic payout processing remains primary.</p></header>
    <form className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto]
      sm:items-end [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} method="get" action="/admin/payouts">
      <div className="min-w-0 space-y-2"><label className="text-body-sm font-medium" htmlFor="payout-search">Search withdrawals</label><input id="payout-search" name="query" maxLength={120} defaultValue={query} placeholder="Reference, creator or payout reference" className="min-h-11 w-full rounded-lg border border-input bg-field px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring" /></div>
      <div className="space-y-2"><label className="text-body-sm font-medium" htmlFor="payout-status">Status</label><select id="payout-status" name="status" defaultValue={status} className="min-h-11 w-full rounded-lg border border-input bg-field px-3 text-foreground focus-visible:outline-2 focus-visible:outline-ring">{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
      <Button type="submit">Apply filters</Button>
    </form>
    {!data.items.length && <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-3 p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="text-lg font-semibold">No withdrawals match these filters</h2><Link prefetch={false} href="/admin/payouts" className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link text-link
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}>Clear filters</Link></section>}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.items.map(w => <article key={w.id} className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card min-w-0 space-y-4 p-5
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}>
      <div className="flex flex-wrap items-start justify-between gap-3"><Status status={w.status} review={w.reviewRequired} /><p className="text-lg font-semibold">{usd(w.submitted ?? w.reserved)} USD</p></div>
      <div className="space-y-1"><h2 className="break-words text-lg font-semibold">{w.creatorName}</h2><Link prefetch={false} href={`/admin/payouts/${w.id}`} className="inline-block min-h-11 break-all py-2 font-mono text-caption text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">{w.id}</Link></div>
      <dl className="grid grid-cols-2 gap-3 text-body-sm"><div><dt className="text-muted-foreground">Requested</dt><dd>{usd(w.requested)} USD</dd></div><div><dt className="text-muted-foreground">Age</dt><dd>{Math.floor(w.ageMinutes / 1440)}d {Math.floor(w.ageMinutes % 1440 / 60)}h</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Request date</dt><dd><When value={w.requestedAt} /></dd></div><div className="col-span-2"><dt className="text-muted-foreground">Hold until</dt><dd><When value={w.holdUntil} /></dd></div><div><dt className="text-muted-foreground">Provider status</dt><dd className="break-words">{w.providerStatus ?? "Not observed"}</dd></div><div><dt className="text-muted-foreground">Last completed check</dt><dd><When value={w.lastCheckedAt} /></dd></div></dl>
    </article>)}</div>
    <MarketplacePagination prefetch={false} page={data.page} total={data.total} pageSize={data.pageSize} href={href} itemLabel="withdrawal" />
  </div>;
}
export function PayoutDetailView({ data, historyPage, auditPage, allocationPage }: { data: PayoutDetail; historyPage: number; auditPage: number; allocationPage: number }) {
  const w = data.withdrawal;
  const pageHref = (key: "historyPage" | "auditPage" | "allocationPage", value: number) => `/admin/payouts/${w.id}?${new URLSearchParams({ historyPage: String(historyPage), auditPage: String(auditPage), allocationPage: String(allocationPage), [key]: String(value) })}`;
  const missing = w.status === "processing" && (!data.batchId || !/^[A-Z0-9]{5,64}$/.test(data.batchId));
  return <div className="space-y-6">
    <header className="space-y-3"><Link prefetch={false} href="/admin/payouts" className={`
      [@layer_components]:inline-flex [@layer_components]:min-h-[var(--control-height)] [@layer_components]:items-center
      [@layer_components]:gap-[var(--space-1)] [@layer_components]:text-[color:var(--muted-foreground)]
      [@layer_components]:text-[length:var(--text-body-sm)] [@layer_components]:font-[500]
      [@layer_components]:[transition:color_var(--duration-fast)]
      [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] nav-link text-link
      [@layer_components]:[&:hover]:text-[color:var(--link)]
      [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
      [@layer_components]:[&:focus-visible]:[outline-offset:4px] [.marketplace-detail-info_>_&&]:min-h-[32px]
      [.marketplace-detail-info_>_&&]:gap-[8px] [.marketplace-detail-info_>_&&]:text-[length:13px]
      [.marketplace-detail-info_>_&&_img]:w-[28px] [.marketplace-detail-info_>_&&_img]:h-[28px]
      [.marketplace-detail-info_>_&&_.rounded-full]:w-[28px] [.marketplace-detail-info_>_&&_.rounded-full]:h-[28px]
      [.workspace-gallery-copy_&&]:min-h-[24px] [.workspace-gallery-copy_&&]:gap-[6px]
      [.workspace-gallery-copy_&&]:text-[length:inherit] [.workspace-gallery-copy_&&]:leading-[inherit]
      [.workspace-settings-inner_&&]:min-h-[28px] [.workspace-settings-inner_&&]:text-[length:12px]
      [@media_(pointer:_coarse)]:[.workspace-settings-inner_&&]:min-h-[44px]
    `}>← Payout support queue</Link><p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>WITHDRAWAL · PAYPAL SANDBOX</p><h1 className="break-all text-2xl font-bold tracking-tight sm:text-3xl">{w.id}</h1><p className="break-words text-muted-foreground">{w.creatorName} · <span className="break-all font-mono text-caption">{w.creatorId}</span></p><Status status={w.status} review={w.reviewRequired} /></header>
    {w.reviewRequired && <p role="status" className="rounded-xl border border-warning/30 bg-warning-surface p-4 text-warning-foreground">{missing ? missingPayoutReferenceMessage : w.status === "paid" && ["RETURNED", "REFUNDED"].includes(w.providerStatus ?? "") ? "PayPal reports a return/refund after payment. The original Paid record is preserved for investigation." : "Needs Review. Existing financial state is preserved for provider investigation."}</p>}
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-5 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="text-xl font-semibold">Withdrawal and provider status</h2>
      <dl className="grid gap-4 text-body-sm sm:grid-cols-2 lg:grid-cols-3">{[["Requested", `${usd(w.requested)} USD`], ["Reserved now", `${usd(w.reserved)} USD`], ["Submitted amount", w.submitted === null ? "Not submitted" : `${usd(w.submitted)} USD`], ["Payout destination", data.destination], ["Provider status", w.providerStatus ?? "Not observed"], ["Internal failure code", data.failureCode ?? "None"]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd className="break-all font-medium">{value}</dd></div>)}
        {[["Requested at", w.requestedAt], ["Hold until", w.holdUntil], ["Submission claimed at", w.processingAt], ["Provider submission acknowledged at", w.submissionAcknowledgedAt], ["Paid at", w.paidAt], ["Last check attempt", w.lastAttemptAt], ["Last completed check", w.lastCheckedAt]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-muted-foreground">{label}</dt><dd><When value={value} /></dd></div>)}
        <div className="min-w-0"><dt className="text-muted-foreground">PayPal batch reference</dt><dd className="break-all font-mono text-caption">{data.batchId ?? "Not persisted"}</dd></div><div className="min-w-0"><dt className="text-muted-foreground">PayPal item reference</dt><dd className="break-all font-mono text-caption">{data.itemId ?? "Not persisted"}</dd></div>
      </dl><p className="text-caption text-muted-foreground">Unknown timestamps have no persisted evidence. Times are shown in WAT.</p>
      <ReconcilePayoutButton withdrawalId={w.id} disabled={["pending", "eligible"].includes(w.status)} />
      {["pending", "eligible"].includes(w.status) && <p className="text-body-sm text-muted-foreground">This withdrawal is waiting for automatic eligibility/submission. Its original hold remains in effect.</p>}
    </section>
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-4 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="text-xl font-semibold">Creator earnings allocation</h2><p className="text-body-sm text-muted-foreground">Original allocation {usd(data.allocations.originalTotal)} · remaining lot backing {usd(data.allocations.remainingTotal)}. The current reservation is shown above.</p>
      <dl className="grid grid-cols-2 gap-4 text-body-sm lg:grid-cols-4">{[["Creator available", data.creatorBalance.available], ["Creator pending payouts", data.creatorBalance.pending], ["Creator paid", data.creatorBalance.paid], ["Creator deficit", data.creatorBalance.deficit]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{usd(Number(value))} USD</dd></div>)}</dl>
      <div className="grid gap-3 md:grid-cols-2">{data.allocations.items.map(a => <article key={a.id} className="min-w-0 space-y-2 rounded-xl border border-border p-4"><p className="break-all font-mono text-caption">Purchase {a.purchaseId}</p><p className="text-body-sm">Original {usd(a.original)} · remaining backing {usd(a.remaining)}</p><p className="text-caption text-muted-foreground">Lot reversed {usd(a.lotReversed)} · available {usd(a.lotAvailable)} · deficit offset {usd(a.lotOffset)}</p></article>)}</div>
      <MarketplacePagination prefetch={false} page={allocationPage} total={data.allocations.total} pageSize={25} href={page => pageHref("allocationPage", page)} itemLabel="allocation" />
    </section>
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-4 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="text-xl font-semibold">Accounting and reversal history</h2>{!data.history.items.length && <p className="text-muted-foreground">No related financial events.</p>}
      <ol className="space-y-3">{data.history.items.map(e => <li key={`${e.kind}:${e.id}`} className="min-w-0 rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium capitalize">{words(e.kind)} · {usd(e.amount)}</p><p className="text-caption text-muted-foreground"><When value={e.at} /></p></div>{e.purchaseId && <p className="break-all font-mono text-caption text-muted-foreground">Purchase {e.purchaseId}</p>}{e.gross !== null && <p className="text-body-sm">Gross reversal {usd(e.gross)} · platform fee reversal {usd(e.fee ?? 0)} · creator reversal {usd(e.amount)}</p>}</li>)}</ol>
      <MarketplacePagination prefetch={false} page={historyPage} total={data.history.total} pageSize={25} href={page => pageHref("historyPage", page)} itemLabel="financial event" />
    </section>
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card space-y-4 p-5 sm:p-6
      [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}><h2 className="text-xl font-semibold">Support and processing audit history</h2><p className="text-body-sm text-muted-foreground">Each view/check appears here. Money movements are listed above.</p>
      <ol className="space-y-3">{data.audit.items.map(e => <li key={e.id} className="min-w-0 space-y-2 rounded-xl border border-border p-4"><div className="flex flex-wrap justify-between gap-2"><p className="font-medium capitalize">{words(e.action)} · {e.source === "support" ? e.actorName : `System ${e.source}`}</p><p className="text-caption text-muted-foreground"><When value={e.at} /></p></div><p className="break-words text-body-sm">{e.priorStatus ?? "—"} → provider {e.observedStatus ?? "not observed"} → {e.resultingStatus ?? "—"}</p><p className="break-all font-mono text-caption text-muted-foreground">{e.actorId ?? "System process"}</p><p className="text-body-sm capitalize">{words(e.outcome)} · {words(e.reason)}</p><p className="break-all font-mono text-caption text-muted-foreground">Check {e.attemptId}</p></li>)}</ol>
      <MarketplacePagination prefetch={false} page={auditPage} total={data.audit.total} pageSize={25} href={page => pageHref("auditPage", page)} itemLabel="audit event" />
    </section>
  </div>;
}
