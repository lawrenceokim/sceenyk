import type { ReactNode } from "react";
import { CreditsWorkspace } from "@/components/credits/credits-workspace";

export const metadata = { title: "Credits & Billing — Sceenyk", robots: { index: false, follow: false } };

export default function CreditsLayout({ children }: { children: ReactNode }) {
  return <CreditsWorkspace>{children}</CreditsWorkspace>;
}
