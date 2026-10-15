import { usd, type CreatorEarnings } from "@/lib/marketplace/payments/contract";

const historyLabels = { sale: "Sale recorded", available: "Moved to available", refund: "Refund adjustment", capture_reversed: "Payment reversal" } as const;
export function EarningsHistory({ earnings }: { earnings: CreatorEarnings }) {
  return <>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[["Pending earnings", earnings.pending], ["Available earnings", earnings.available], ["Lifetime gross sales", earnings.lifetimeGross], ["Lifetime net after reversals", earnings.lifetime], ["Creator net reversed", earnings.reversedNet], ["Platform fees reversed", earnings.reversedFee]].map(([label, value]) =>
        <section key={label} className="sceenyk-card space-y-2 p-5"><h2 className="text-body-sm text-muted-foreground">{label}</h2><p className="text-2xl font-semibold">{usd(Number(value))}</p></section>)}
    </div>
    <p className="text-body-sm text-muted-foreground">Creator money is separate from AI credits. New verified sales use a 10% Marketplace fee and 90% creator share, with valid earnings available immediately. Historical Sandbox sales retain their original terms. Withdrawals reserve earnings and are held for 7 days before payout. Refunded gross sales: {usd(earnings.reversedGross)}.</p>
    <div className="space-y-4">{earnings.sales.map((sale, i) => <article key={i} className="sceenyk-card space-y-3 p-5">
      <h2 className="break-words font-semibold">{sale.title}</h2>
      <p className="text-caption text-muted-foreground">{new Date(sale.createdAt).toLocaleDateString()} · {sale.state}{sale.reversedGross > 0 && sale.state !== "reversed" ? " · partially refunded" : ""}</p>
      {sale.state === "pending" && sale.eligibleAt && <p className="text-body-sm text-muted-foreground">Test eligibility: {new Date(sale.eligibleAt).toLocaleString()}. Payment verification is required before availability.</p>}
      <dl className="grid gap-3 text-body-sm sm:grid-cols-3">{[["Original gross", sale.gross], ["Original platform fee", sale.fee], ["Original creator net", sale.net], ["Refunded gross", sale.reversedGross], ["Creator net reversed", sale.reversedNet], ["Remaining creator net", sale.remainingNet]].map(([label, value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd>{usd(Number(value))}</dd></div>)}</dl>
      <details className="rounded-lg border border-border p-3"><summary className="cursor-pointer py-2 text-body-sm font-medium focus-visible:outline-2 focus-visible:outline-ring">Sale and adjustment history</summary>
        <ol className="mt-3 space-y-3">{sale.history.map((event, index) => <li key={index} className="space-y-1 text-body-sm"><p className="font-medium">{historyLabels[event.kind]}</p><p className="text-caption text-muted-foreground">{new Date(event.at).toLocaleString()}</p><p>Gross {usd(event.gross)} · Fee {usd(event.fee)} · Creator net {usd(event.net)}</p></li>)}</ol>
      </details>
    </article>)}</div>
  </>;
}
