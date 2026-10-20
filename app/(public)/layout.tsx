import type { ReactNode } from "react";
import { PublicNavbar, PublicFooter } from "@/components/landing/landing-chrome";
import { SmoothScroll } from "@/components/ui/smooth-scroll";
import { Suspense } from "react";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Suspense fallback={null}><SmoothScroll /></Suspense>
      <a href="#main-content" className={`
      [@layer_components]:fixed [@layer_components]:top-[var(--space-3)] [@layer_components]:left-[var(--space-4)]
      [@layer_components]:z-[60] [@layer_components]:pt-[var(--space-3)] [@layer_components]:pr-[var(--space-4)]
      [@layer_components]:pb-[var(--space-3)] [@layer_components]:pl-[var(--space-4)]
      [@layer_components]:rounded-[var(--radius-lg)] [@layer_components]:[background:var(--primary)]
      [@layer_components]:text-[color:var(--primary-foreground)] [@layer_components]:[transform:translateY(-200%)] skip-link
      [@layer_components]:[&:focus]:[transform:translateY(0)]
    `}>
        Skip to content
      </a>
      <PublicNavbar />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <PublicFooter />
    </>
  );
}
