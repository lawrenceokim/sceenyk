import type { ReactNode } from "react";
import { PublicNavbar, PublicFooter } from "@/components/landing/landing-chrome";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a href="#main-content" className="skip-link">
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
