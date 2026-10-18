"use client";

import { useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceMobileNav } from "./workspace-mobile-nav";
import "./workspace.css";

const preferenceKey = "sceenyk-workspace-collapsed";
let temporaryPreference: boolean | null = null;
function readCollapsed() {
  if (temporaryPreference !== null) return temporaryPreference;
  try { return localStorage.getItem(preferenceKey) === "true"; }
  catch { return false; }
}
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener("sceenyk-workspace-navigation", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("sceenyk-workspace-navigation", callback);
  };
}
function toggleCollapsed() {
  const next = !readCollapsed();
  try { localStorage.setItem(preferenceKey, String(next)); temporaryPreference = null; }
  catch { temporaryPreference = next; }
  window.dispatchEvent(new Event("sceenyk-workspace-navigation"));
}

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);
  return <div className="min-h-dvh flex-1 bg-background" data-workspace-shell data-collapsed={collapsed} style={{ "--workspace-sidebar-width": collapsed ? "64px" : "260px" } as CSSProperties}>
    <a href="#workspace-content" className="skip-link">Skip to content</a>
    <WorkspaceSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
    <div className="min-w-0 lg:pl-[var(--workspace-sidebar-width)]">
      <WorkspaceMobileNav />
      <div className="workspace-gutter">
        <main id="workspace-content" tabIndex={-1} className="workspace-content min-w-0 text-card-foreground outline-none">{children}</main>
      </div>
    </div>
  </div>;
}
