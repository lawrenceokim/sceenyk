"use client";

import type { ComponentProps } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Replace this preview boundary with Clerk modal triggers when Clerk is configured.
// This component never collects credentials or creates an authenticated session.
export function AccountAction({
  children,
  intent = "create",
  ...props
}: ComponentProps<typeof Button> & { intent?: "sign-in" | "create" }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button {...props} />}>{children}</DialogTrigger>
      <DialogContent className="text-center">
        <span className="mx-auto mt-2 flex size-14 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Sparkles className="size-7" aria-hidden="true" />
        </span>
        <DialogTitle className="text-heading-3 font-semibold">
          {intent === "sign-in"
            ? "Sign in is coming soon"
            : "Your next idea starts here"}
        </DialogTitle>
        <DialogDescription className="text-body leading-relaxed">
          You’re exploring the Sceenyk preview. Account access and the creation
          studio are coming soon. For now, discover what you’ll be able to
          create.
        </DialogDescription>
        <DialogClose
          render={<Button variant="outline" className="mt-2 w-full" />}
        >
          Keep exploring
        </DialogClose>
      </DialogContent>
    </Dialog>
  );
}
