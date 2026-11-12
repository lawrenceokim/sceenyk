"use client";
import { PurchaseSummarySkeleton } from "@/components/payments/financial-skeletons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import {
  Layers2,
  LoaderCircle,
  Play,
  ReceiptText,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  marketplaceCheckoutAction,
  createMarketplaceOrderAction,
  recoverMarketplacePurchaseAction,
} from "@/lib/cache/actions/marketplace-payments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  usd,
  type MarketplacePurchaseSummary,
} from "@/lib/marketplace/payments/contract";
import { AppNotification } from "@/components/notifications/app-notification";


export function PaidAdoption({
  listingId,
  estimate,
  preview,
}: {
  listingId: string;
  estimate: { credits: number; test: boolean } | null;
  preview?: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [purchase, setPurchase] = useState<MarketplacePurchaseSummary | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [approval, setApproval] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function run(kind: "summary" | "pay" | "recover") {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (kind === "summary") {
        setOpen(true);
        const r = await marketplaceCheckoutAction({ listingId });
        if (!alive.current) return;
        if (!r.ok) {
          setError(r.message);
          return;
        }
        setPurchase(r.data);
        if (r.data.projectId) router.push(`/projects/${r.data.projectId}`);
      } else if (purchase) {
        if (kind === "pay") {
          const r = await createMarketplaceOrderAction({
            purchaseId: purchase.id,
          });
          if (!alive.current) return;
          if (!r.ok) {
            setError(r.message);
            return;
          }
          setPurchase(r.data.purchase);
          setApproval(r.data.approvalUrl);
          if (r.data.purchase.projectId)
            router.push(`/projects/${r.data.purchase.projectId}`);
          else if (r.data.approvalUrl)
            window.location.assign(r.data.approvalUrl);
        } else {
          const r = await recoverMarketplacePurchaseAction({
            purchaseId: purchase.id,
          });
          if (!alive.current) return;
          if (!r.ok) {
            setError(r.message);
            return;
          }
          setPurchase(r.data);
          if (r.data.projectId) router.push(`/projects/${r.data.projectId}`);
        }
      }
    } catch {
      if (alive.current)
        setError(
          "Check your saved Marketplace purchases before starting another checkout.",
        );
    } finally {
      if (alive.current) setBusy(false);
      inFlight.current = false;
    }
  }
  return (
    <>
      <Button
        className="w-full"
        disabled={busy}
        onClick={() => void run("summary")}
      >
        Adopt with PayPal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          overlayClassName="bg-background/65 backdrop-blur-md supports-backdrop-filter:backdrop-blur-md dark:bg-black/65"
          className="scrollbar-hidden isolate gap-0 overflow-x-hidden rounded-[28px] border-primary/25 bg-card p-5 text-foreground shadow-2xl shadow-black/15 [background-image:radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_55%),linear-gradient(135deg,transparent,color-mix(in_srgb,var(--primary)_7%,transparent))] dark:shadow-black/60 sm:max-w-[550px] sm:rounded-[32px] sm:p-8 [&>[data-slot=dialog-close]]:top-4 [&>[data-slot=dialog-close]]:right-4"
        >
          <div
            className="pointer-events-none -mt-3 flex h-[120px] items-center justify-center sm:-mt-4 sm:h-[132px]"
            aria-hidden="true"
          >
            <Image
              src="/images/marketplace/adopt-template.svg"
              alt=""
              width={400}
              height={170}
              className="h-full w-auto max-w-full object-contain"
            />
          </div>
          <DialogTitle className="mx-auto max-w-[92%] text-center text-xl leading-tight font-semibold tracking-tight sm:text-[22px]">
            Adopt this creator template
          </DialogTitle>
          <DialogDescription className="sr-only">
            Review the template price, pay with PayPal, or recover your
            saved purchase. AI generation is separate.
          </DialogDescription>

          {purchase && (
            <div
              className="mt-6 space-y-5 sm:mt-7 sm:space-y-6"
              aria-busy={busy}
            >
              <div className="relative isolate flex min-w-0 items-center gap-4 overflow-hidden rounded-[22px] border border-primary/30 bg-primary/[0.06] p-3 shadow-sm after:pointer-events-none after:absolute after:-right-16 after:-bottom-24 after:-z-10 after:h-40 after:w-72 after:rotate-[-18deg] after:rounded-[50%] after:bg-primary/10 sm:gap-5 sm:p-3.5">
                <div className="relative aspect-[3/2] w-[100px] shrink-0 overflow-hidden rounded-[14px] bg-primary/10 sm:w-[130px] [&>div]:h-full [&>div]:w-full [&_img]:h-full [&_img]:w-full [&_img]:object-cover">
                  {preview ?? (
                    <div className="flex size-full items-center justify-center bg-gradient-to-br from-primary/25 to-primary/5">
                      <Play
                        aria-hidden="true"
                        className="size-9 fill-primary/20 text-primary"
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 space-y-2.5">
                  <h3 className="break-words text-base leading-tight font-semibold tracking-tight sm:text-lg">
                    {purchase.title}
                  </h3>
                  <p className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1 text-[13px] font-semibold">
                    <Tag
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-primary"
                    />
                    <span>{usd(purchase.amountMinor)} USD</span>
                  </p>
                </div>
              </div>

              <div className="divide-y divide-primary/15">
                <div className="flex items-start gap-3.5 pb-4 sm:gap-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Layers2 aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 space-y-1 text-[13px] leading-5">
                    <p className="font-medium">
                      Payment unlocks one adopted template project.
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      It does not include future AI generation usage.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3.5 pt-4 sm:gap-5">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
                    <Sparkles aria-hidden="true" className="size-5" />
                  </span>
                  <div className="min-w-0 space-y-1 text-[13px] leading-5">
                    <p className="font-medium">
                      {estimate
                        ? `Estimated AI generation: ~${estimate.credits} Sceenyk credits${estimate.test ? " (test pricing)" : ""}`
                        : "AI generation cost: review in your project."}
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      This saved checkout retains its reviewed price. No AI
                      credits are purchased or consumed.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Button
                  className="h-auto min-h-10 w-full gap-2 rounded-lg px-4 py-2 text-sm font-semibold whitespace-normal shadow-md shadow-primary/15 [@media(pointer:coarse)]:min-h-11"
                  disabled={busy || purchase.status === "failed"}
                  onClick={() =>
                    void run(
                      purchase.status === "completed" ? "recover" : "pay",
                    )
                  }
                >
                  {busy ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 motion-safe:animate-spin"
                    />
                  ) : (
                    <svg
                      viewBox="0 0 24 28"
                      fill="currentColor"
                      aria-hidden="true"
                      className="size-5 shrink-0"
                    >
                      <path
                        d="M8 1h9c5 0 7 3 6 7-1 5-5 8-10 8h-3l-2 10H2L7 3c0-1 0-2 1-2Z"
                        opacity=".6"
                      />
                      <path d="M5 0h9c5 0 7 3 6 7-1 5-5 8-10 8H8L6 25H0L4 2c0-1 0-2 1-2Z" />
                    </svg>
                  )}
                  {busy
                    ? "Checking purchase…"
                    : purchase.status === "completed"
                      ? "Open adopted project"
                      : "Pay with PayPal"}
                </Button>
                {approval && (
                  <a
                    className="flex min-h-10 items-center justify-center rounded-lg px-3 text-center text-xs text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    href={approval}
                  >
                    Continue to PayPal
                  </a>
                )}
                <Button
                  variant="outline"
                  className="h-auto min-h-10 w-full gap-2 rounded-lg border-primary/40 bg-transparent px-4 py-2 text-sm font-medium whitespace-normal hover:bg-primary/5 [@media(pointer:coarse)]:min-h-11"
                  disabled={busy}
                  onClick={() => void run("recover")}
                >
                  <ReceiptText aria-hidden="true" className="size-4 shrink-0" />
                  Check saved purchase
                </Button>
              </div>
            </div>
          )}
          {!purchase && busy && !error && (
            <div className="mt-6">
              <PurchaseSummarySkeleton />
            </div>
          )}
          {error && (
            <AppNotification
              role="alert"
              className="mt-4 rounded-xl border border-destructive/20 bg-destructive-surface p-3 text-[13px] leading-5 text-destructive"
            >
              {error}
            </AppNotification>
          )}
          <Link
            className="mx-auto mt-6 inline-flex min-h-10 max-w-full items-center justify-center rounded-lg px-2 text-center text-xs font-medium text-link underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:mt-7"
            href="/marketplace/purchases"
          >
            My Marketplace purchases
          </Link>
        </DialogContent>
      </Dialog>
    </>
  );
}
