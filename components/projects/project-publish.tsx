"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { initializeTemplateAction } from "@/app/actions/marketplace";

export function ProjectPublish({ projectId, listingId, compact = false }: { projectId: string; listingId?: string | null; compact?: boolean }) {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const label = listingId ? "Manage Template" : "Publish";
  function publish() {
    if (inFlight.current) return;
    if (listingId) { router.push(`/settings/templates/${listingId}`); return; }
    inFlight.current = true;
    setError("");
    startTransition(async () => {
      try {
        const result = await initializeTemplateAction(projectId);
        if (result.ok && "listingId" in result) router.push(`/settings/templates/${result.listingId}`);
        else setError(result.ok ? "Please try again." : result.message);
      } catch { setError("This template couldn’t be opened. Try again."); }
      finally { inFlight.current = false; }
    });
  }
  return <span className="relative z-10 flex min-w-0 flex-col items-start">
    <button type="button" onClick={publish} disabled={pending} aria-busy={pending}
      aria-label={`${label} for this project`} title={error || label}
      className={`inline-flex max-w-full min-w-0 cursor-pointer items-center gap-1 rounded-md font-medium outline-none transition-colors duration-[var(--motion-micro)] ease-[var(--motion-ease)] focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none [@media(pointer:coarse)]:min-h-11 ${compact ? "h-6 min-h-6 bg-primary px-2 text-[10px] text-primary-foreground hover:bg-primary/90" : "min-h-[30px] px-2 text-[11px] text-foreground hover:text-link"}`}>
      {pending && <LoaderCircle className="size-3 shrink-0 motion-safe:animate-spin" aria-hidden="true" />}
      <span className="truncate">{pending ? "Opening..." : label}</span>
    </button>
    {error && <span role="alert" className="max-w-full break-words text-[11px] text-destructive">{error}</span>}
  </span>;
}
