"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openPurchaseProjectAction } from "@/app/actions/purchases";

export function CreateVersionButton({ id, title, label = "Create your version" }: { id: string; title: string; label?: string }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function open() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const result = await openPurchaseProjectAction(id);
      if (!result.ok || !("projectId" in result)) {
        setError(result.ok ? "Your project couldn’t be opened. Try again." : result.message);
        return;
      }
      router.push(`/projects/${result.projectId}`);
    } catch { setError("Your project couldn’t be opened. Try again to recover the same version."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <div className="w-full">
    <Button disabled={busy} aria-busy={busy} onClick={() => void open()}
      aria-label={`${label}: ${title}`}
      className="h-auto min-h-10 w-full rounded-lg px-3 py-2 text-sm whitespace-normal [@media(pointer:coarse)]:min-h-11">
      {busy && <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />}
      {busy ? "Opening your project…" : label}
    </Button>
    {error && <p role="alert" className="mt-2 text-xs leading-5 text-destructive">{error}</p>}
  </div>;
}
