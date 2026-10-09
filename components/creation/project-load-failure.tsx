"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ProjectLoadFailure() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <section className="sceenyk-card p-6" aria-labelledby="project-load-error">
      <CircleAlert className="size-6 text-destructive" aria-hidden="true" />
      <h2 id="project-load-error" className="mt-4 text-heading-3 font-semibold">
        Your draft couldn’t be loaded
      </h2>
      <p className="mt-2 text-body-sm text-muted-foreground">
        Please try again in a moment. Your saved brief hasn’t been changed.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Button
          disabled={pending}
          aria-busy={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          {pending ? "Opening draft…" : "Try again"}
        </Button>
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href="/dashboard#projects" />}
        >
          Your projects
        </Button>
      </div>
    </section>
  );
}
