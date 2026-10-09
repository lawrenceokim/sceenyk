"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
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

// Creation is public preview navigation. Sign-in remains a Clerk-ready notice.
// This component never collects credentials or creates an authenticated session.
export function AccountAction({
  children,
  intent = "create",
  ...props
}: ComponentProps<typeof Button> & { intent?: "sign-in" | "create" }) {
  if (intent === "create") {
    return (
      <Button {...props} nativeButton={false} render={<Link href="/create" />}>
        {children}
      </Button>
    );
  }
  return (
    <Dialog>
      <DialogTrigger render={<Button {...props} />}>{children}</DialogTrigger>
      <DialogContent className="text-center">
        <span className="mx-auto mt-2 flex size-14 items-center justify-center rounded-xl bg-accent text-accent-foreground">
          <Sparkles className="size-7" aria-hidden="true" />
        </span>
        <DialogTitle className="text-heading-3 font-semibold">
          Sign in is coming soon
        </DialogTitle>
        <DialogDescription className="text-body leading-relaxed">
          You’re exploring the Sceenyk preview. Account access is coming soon.
          You can explore the creation workspace without signing in during this
          preview.
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
