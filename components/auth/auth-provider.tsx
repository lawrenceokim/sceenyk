import type { ReactNode } from "react";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { getClerkDevelopmentConfig } from "@/lib/auth/config";
import { AuthAvailabilityProvider } from "./auth-availability";
import { AuthModalReturn } from "./auth-modal-return";

export function AuthProvider({ children }: { children: ReactNode }) {
  const { enabled, publishableKey } = getClerkDevelopmentConfig();
  const content = (
    <AuthAvailabilityProvider enabled={enabled}>
      <AuthModalReturn />
      {children}
    </AuthAvailabilityProvider>
  );
  if (!enabled) return content;

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      signInUrl="/?auth=sign-in"
      signUpUrl="/?auth=sign-up"
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/dashboard"
      afterSignOutUrl="/"
      appearance={{
        theme: shadcn,
        variables: {
          colorInput: "var(--field)",
          colorBorder: "var(--border)",
          colorModalBackdrop: "var(--overlay)",
          colorRing: "var(--ring)",
          fontFamily: "var(--font-inter), Arial, Helvetica, sans-serif",
          borderRadius: "var(--radius)",
        },
        elements: {
          modalBackdrop: "[align-items:safe_center]! p-4",
          modalContent: "m-0!",
          formButtonPrimary: "sceenyk-action",
          userButtonTrigger:
            "size-11 justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        },
      }}
    >
      {content}
    </ClerkProvider>
  );
}
