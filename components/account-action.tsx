"use client";

import { useContext, type ComponentProps } from "react";
import { BeforeAccountAuth } from "@/components/auth/before-account-auth";
import Link from "next/link";
import { SignInButton, SignUpButton, useAuth } from "@clerk/nextjs";
import { useAuthAvailable } from "@/components/auth/auth-availability";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type AccountActionProps = ComponentProps<typeof Button> & {
  intent?: "sign-in" | "sign-up" | "create";
};

function ClerkAction({ children, intent, ...props }: AccountActionProps) {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded)
    return (
      <Button {...props} disabled aria-busy="true">
        {children}
      </Button>
    );
  if (isSignedIn) {
    return (
      <Button
        {...props}
        nativeButton={false}
        render={<Link href="/dashboard" />}
      >
        {children}
      </Button>
    );
  }
  const action = <Button {...props}>{children}</Button>;
  return intent === "sign-up" ? (
    <SignUpButton mode="modal">{action}</SignUpButton>
  ) : (
    <SignInButton mode="modal">{action}</SignInButton>
  );
}

export function AccountAction({
  children,
  intent = "create",
  ...props
}: AccountActionProps) {
  const beforeAuth = useContext(BeforeAccountAuth);
  const available = useAuthAvailable();
  if (intent === "create") {
    return (
      <Button {...props} nativeButton={false} render={<Link href="/studio" />}>
        {children}
      </Button>
    );
  }
  if (available)
    return (
      <ClerkAction {...props} data-account-auth intent={intent} onClick={event => { beforeAuth?.(); props.onClick?.(event); }}>
        {children}
      </ClerkAction>
    );
  return (
    <Dialog>
      <DialogTrigger render={<Button {...props} />}>{children}</DialogTrigger>
      <DialogContent className="text-center">
        <DialogTitle className="text-heading-3 font-semibold">
          Account access is unavailable
        </DialogTitle>
        <DialogDescription className="text-body leading-relaxed">
          Sign in is temporarily unavailable. You can still explore Sceenyk and
          the creation workspace.
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
