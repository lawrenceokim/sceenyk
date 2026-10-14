"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ArrowUpRight, LoaderCircle, Plus } from "lucide-react";
import { AccountAction } from "@/components/account-action";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { Button } from "@/components/ui/button";
import { adoptMarketplaceAction } from "@/app/actions/marketplace";
import { PaidAdoption } from "./paid-adoption";

type Props = { listingId: string; paid?: boolean; estimate?: { credits: number; test: boolean } | null };

function SignedInAdoption({ listingId, paid, estimate }: Props) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  if (!isLoaded) return <Button disabled className="w-full">Loading account…</Button>;
  if (!isSignedIn) return <AccountAction intent="sign-in" className="w-full">Sign in to adopt</AccountAction>;
  return paid ? <PaidAdoption key={userId} listingId={listingId} estimate={estimate ?? null} /> : <Adoption key={userId} listingId={listingId} identity={userId!} />;
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
  </Button><p role="status" className={error ? "text-body-sm text-destructive" : "text-body-sm text-success-foreground"}>{error || (state === "adopted" ? "Template adopted. Opening your project…" : "")}</p></div>;
}
export function AdoptButton(props: Props) {
  return useAuthAvailable() ? <SignedInAdoption {...props} /> : <AccountAction intent="sign-in" className="w-full">Sign in to adopt</AccountAction>;
}
