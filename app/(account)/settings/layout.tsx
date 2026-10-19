import type { ReactNode } from "react";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";

export const metadata = { title: "Settings — Sceenyk", robots: { index: false, follow: false } };

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsWorkspace>{children}</SettingsWorkspace>;
}
