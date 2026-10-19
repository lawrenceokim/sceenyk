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
      className={`
      [@layer_components]:[border:1px_solid_var(--border)] [@layer_components]:rounded-[var(--radius-xl)]
      [@layer_components]:[background:var(--card)] [@layer_components]:text-[color:var(--card-foreground)]
      [@layer_components]:[box-shadow:var(--elevation-card)] sceenyk-card flex flex-col items-center px-5 py-12 text-center
      sm:px-8 [.marketplace-configuration_>_&&]:[border:0] [.marketplace-configuration_>_&&]:rounded-[0]
      [.marketplace-configuration_>_&&]:[background:transparent] [.marketplace-configuration_>_&&]:pt-[16px]
      [.marketplace-configuration_>_&&]:pr-[0] [.marketplace-configuration_>_&&]:pb-[0]
      [.marketplace-configuration_>_&&]:pl-[0] [[data-workspace-shell]_&&]:[box-shadow:none]
      [.workspace-settings-inner_label&&]:min-h-[0] [.workspace-settings-inner_label&&]:gap-[8px]
      [.workspace-settings-inner_label&&]:pt-[12px] [.workspace-settings-inner_label&&]:pr-[12px]
      [.workspace-settings-inner_label&&]:pb-[12px] [.workspace-settings-inner_label&&]:pl-[12px]
      [.workspace-settings-inner_label&&_svg]:w-[18px] [.workspace-settings-inner_label&&_svg]:h-[18px]
    `}
    >
      <CircleAlert aria-hidden="true" className="mb-5 size-8 text-primary" />
      <p className={`
      [@layer_components]:text-[color:var(--link)] [@layer_components]:text-[length:var(--text-caption)]
      [@layer_components]:font-[600] [@layer_components]:tracking-[0.12em] eyebrow
      [.workspace-page[data-workspace-page='content']_&&]:hidden
    `}>SIGNED IN</p>
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
