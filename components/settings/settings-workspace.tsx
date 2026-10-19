"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { SettingsNavigation } from "./settings-navigation";
import "./settings.css";

export function SettingsWorkspace({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return <div className="workspace-documentation workspace-settings">
    <SettingsNavigation />
    <div className="workspace-doc-reader workspace-settings-main">
      <header className="workspace-doc-header workspace-settings-header">
        <h1>Settings</h1>
        <p>Make Sceenyk feel like a creative home.</p>
      </header>
      <div key={pathname} className="workspace-doc-article workspace-settings-content" tabIndex={0} role="region" aria-label="Selected settings section">
        <div className="workspace-settings-inner">{children}</div>
      </div>
    </div>
  </div>;
}
