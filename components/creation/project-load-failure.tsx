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
    <section className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card p-6 [.marketplace-configuration_>_&&]:[border:0]
      [.marketplace-configuration_>_&&]:rounded-[0] [.marketplace-configuration_>_&&]:[background:transparent]
      [.marketplace-configuration_>_&&]:pt-[16px] [.marketplace-configuration_>_&&]:pr-[0]
      [.marketplace-configuration_>_&&]:pb-[0] [.marketplace-configuration_>_&&]:pl-[0]
      [[data-workspace-shell]_&&]:[box-shadow:none] [.workspace-settings-inner_label&&]:min-h-[0]
      [.workspace-settings-inner_label&&]:gap-[8px] [.workspace-settings-inner_label&&]:pt-[12px]
      [.workspace-settings-inner_label&&]:pr-[12px] [.workspace-settings-inner_label&&]:pb-[12px]
      [.workspace-settings-inner_label&&]:pl-[12px] [.workspace-settings-inner_label&&_svg]:w-[18px]
      [.workspace-settings-inner_label&&_svg]:h-[18px]
    `} aria-labelledby="project-load-error">
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
          render={<Link href="/projects" />}
        >
          Your projects
        </Button>
      </div>
    </section>
  );
}
