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
      signInForceRedirectUrl="/studio"
      signUpForceRedirectUrl="/studio"
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
          formButtonPrimary: `
            [@layer_components]:[background-color:var(--primary)]
            [@layer_components]:[background-image:var(--gradient-action)]
            [@layer_components]:text-[color:var(--primary-foreground)]
            [@layer_components]:[box-shadow:var(--glow-primary)]
            [@layer_components]:[transition:background-color_var(--duration-fast),_box-shadow_var(--duration-fast),_transform_var(--duration-fast)]
            [@layer_components]:[@media_(prefers-reduced-motion:_reduce)]:[transition:none] sceenyk-action
            [@layer_components]:[&:focus-visible]:[outline:2px_solid_var(--ring)]
            [@layer_components]:[&:focus-visible]:[outline-offset:3px]
            [@layer_components]:[@media_(hover:_hover)]:[&:hover:not(:disabled,_[aria-disabled='true'],_[data-disabled])]:[background-image:var(--gradient-action-hover)]
            [@layer_components]:[@media_(hover:_hover)]:[&:hover:not(:disabled,_[aria-disabled='true'],_[data-disabled])]:[box-shadow:var(--glow-primary-hover)]
          `,
          userButtonTrigger:
            "size-11 justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        },
      }}
    >
      {content}
    </ClerkProvider>
  );
}
