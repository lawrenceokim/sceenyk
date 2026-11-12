"use client";

import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowUpRight, LoaderCircle, Plus } from "lucide-react";
import { AccountAction } from "@/components/account-action";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { Button } from "@/components/ui/button";
import { adoptMarketplaceAction, marketplaceListingAccessAction } from "@/lib/cache/actions/marketplace";
import { PaidAdoption } from "./paid-adoption";
import { AppNotification } from "@/components/notifications/app-notification";


type Props = { listingId: string; paid?: boolean; estimate?: { credits: number; test: boolean } | null; preview?: ReactNode };

function SignedInAdoption({ listingId, paid, estimate, preview }: Props) {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded) return <SkeletonRegion label="Loading account…" className="w-full"><Skeleton className="h-11 w-full" /></SkeletonRegion>;
  if (!isSignedIn) return <AccountAction intent="sign-in" className="w-full">Sign in to adopt</AccountAction>;
  return <ListingViewerAction key={`${userId}:${sessionId}:${listingId}`} listingId={listingId} paid={paid} estimate={estimate} preview={preview} identity={userId!} />;
}

function ListingViewerAction({ listingId, paid, estimate, preview, identity }: Props & { identity: string }) {
  const [access, setAccess] = useState<"checking" | "owner" | "visitor" | "unavailable">("checking");
  const [retry, setRetry] = useState(0);
  const pending = useRef<ReturnType<typeof marketplaceListingAccessAction> | null>(null);
  useEffect(() => {
    let active = true;
    // Reuse a pending check when Strict Mode or Activity restarts this effect.
    pending.current ??= marketplaceListingAccessAction(listingId);
    const request = pending.current;
    request.then(result => {
      if (active) setAccess(result.ok && result.clerkUserId === identity ? result.owned ? "owner" : "visitor" : "unavailable");
    }).catch(() => { if (active) setAccess("unavailable"); }).finally(() => {
      if (pending.current === request) pending.current = null;
    });
    return () => { active = false; };
  }, [listingId, identity, retry]);
  if (access === "checking") return <SkeletonRegion label="Checking template access…" className="w-full"><Skeleton className="h-11 w-full" /></SkeletonRegion>;
  if (access === "unavailable") return <div className="space-y-2">
    <AppNotification role="status" className="text-body-sm text-muted-foreground">Template access couldn’t be checked.</AppNotification>
    <Button variant="outline" className="w-full" onClick={() => setRetry(n => n + 1)}>Try again</Button>
  </div>;
  if (access === "owner") return <Button className="w-full" nativeButton={false}
    render={<Link href={`/settings/templates/${listingId}`} prefetch={false} />}>Update Template</Button>;
  return paid ? <PaidAdoption listingId={listingId} estimate={estimate ?? null} preview={preview} /> : <Adoption listingId={listingId} identity={identity} />;
}
function Adoption({ listingId, identity }: { listingId: string; identity: string }) {
  const router = useRouter();
  const requestId = useRef<string | null>(null);
  const inFlight = useRef(false);
  const [state, setState] = useState<"ready" | "creating" | "adopted">("ready");
  const [error, setError] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  async function adopt() {
    if (inFlight.current) return;
    inFlight.current = true; setState("creating"); setError("");
    // Persist only a random request token, scoped to this account/listing/tab.
    // Retain it through network failures and reloads; the database is authority.
    const key = `sceenyk-adoption:${identity}:${listingId}`;
    if (!requestId.current) {
      try { const prior = sessionStorage.getItem(key); if (prior && /^[0-9a-f-]{36}$/i.test(prior)) requestId.current = prior; } catch {}
      requestId.current ??= crypto.randomUUID();
      try { sessionStorage.setItem(key, requestId.current); } catch {}
    }
    try {
      const result = await adoptMarketplaceAction({ listingId, requestId: requestId.current });
      if (!result.ok || !("projectId" in result)) { setError(result.ok ? "Please try again." : result.message); setState("ready"); return; }
      setProjectId(result.projectId); setState("adopted"); router.push(`/projects/${result.projectId}`);
    } catch { setError("Your project couldn’t be opened. Try again to recover the same adoption."); setState("ready"); }
    finally { inFlight.current = false; }
  }
  return <div className="space-y-3"><Button className="w-full" disabled={state === "creating"} aria-busy={state === "creating"} onClick={() => projectId ? router.push(`/projects/${projectId}`) : void adopt()}>
    {state === "creating" ? <LoaderCircle className="size-4 motion-safe:animate-spin" aria-hidden="true" /> : state === "adopted" ? <ArrowUpRight className="size-4" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
    {state === "creating" ? "Creating your project…" : state === "adopted" ? "Open your adopted project" : "Adopt template"}
  </Button><AppNotification role="status" className={error ? "text-body-sm text-destructive" : "text-body-sm text-success-foreground"}>{error || (state === "adopted" ? "Template adopted. Opening your project…" : "")}</AppNotification></div>;
}
export function AdoptButton(props: Props) {
  return useAuthAvailable() ? <SignedInAdoption {...props} /> : <AccountAction intent="sign-in" className="w-full">Sign in to adopt</AccountAction>;
}
