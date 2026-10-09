"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkspaceUnavailable() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <section
      aria-labelledby="workspace-unavailable-title"
      className="sceenyk-card flex flex-col items-center px-5 py-12 text-center sm:px-8"
    >
      <CircleAlert aria-hidden="true" className="mb-5 size-8 text-primary" />
      <p className="eyebrow">SIGNED IN</p>
      <h1
        id="workspace-unavailable-title"
        className="mt-3 text-heading-3 font-semibold"
      >
        Your workspace couldn’t be opened
      </h1>
      <p className="mt-3 max-w-md text-body-sm leading-relaxed text-muted-foreground">
        Your account is signed in. We couldn’t prepare your workspace right now.
        Please try again in a moment.
      </p>
      <Button
        className="mt-6"
        disabled={pending}
        aria-busy={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {pending ? "Opening workspace…" : "Try again"}
      </Button>
    </section>
  );
}
