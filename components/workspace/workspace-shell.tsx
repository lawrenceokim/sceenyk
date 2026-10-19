"use client";

import { useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceMobileNav } from "./workspace-mobile-nav";

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
  useEffect(() => {
    // Cached routes can remain mounted under Activity with display:none.
    // Effects deactivate with the route, unlike :has() descendant selectors.
    const targets = [document.documentElement, document.body];
    targets.forEach(target => target.classList.add("scrollbar-hidden"));
    return () => targets.forEach(target => target.classList.remove("scrollbar-hidden"));
  }, []);
  return <div className={`
      workspace-shell min-h-dvh flex-1 bg-background
      max-1023:[&&:has(_>_div_>_.workspace-gutter_>_.workspace-content_>_:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)_)]:h-[100dvh]
      max-1023:[&&:has(_>_div_>_.workspace-gutter_>_.workspace-content_>_:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)_)]:min-h-[0]
      max-1023:[&&:has(_>_div_>_.workspace-gutter_>_.workspace-content_>_:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)_)]:overflow-clip
      [&&_[aria-label='Open_account_menu']]:min-h-[48px] [&&_[aria-label='Open_account_menu']]:gap-[8px]
      [&&_[aria-label='Open_account_menu']]:rounded-[8px] min-[1024px]:[&&]:h-[100dvh] min-[1024px]:[&&]:min-h-[0]
      min-[1024px]:[&&]:overflow-clip
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='documentation'])]:h-[100dvh]
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='documentation'])]:min-h-[0]
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='documentation'])]:overflow-clip
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='projects'])]:h-[100dvh]
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='projects'])]:min-h-[0]
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='projects'])]:overflow-clip
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='settings'])]:h-[100dvh]
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='settings'])]:min-h-[0]
      [&&:has(>_div_>_.workspace-gutter_>_.workspace-content_>_[data-workspace-view='settings'])]:overflow-clip
    `} data-workspace-shell data-collapsed={collapsed} style={{ "--workspace-sidebar-width": collapsed ? "var(--workspace-nav-closed)" : "var(--workspace-nav-open)" } as CSSProperties}>
    <a href="#workspace-content" className={`
      [@layer_components]:fixed [@layer_components]:top-[var(--space-3)] [@layer_components]:left-[var(--space-4)]
      [@layer_components]:z-[60] [@layer_components]:pt-[var(--space-3)] [@layer_components]:pr-[var(--space-4)]
      [@layer_components]:pb-[var(--space-3)] [@layer_components]:pl-[var(--space-4)]
      [@layer_components]:rounded-[var(--radius-lg)] [@layer_components]:[background:var(--primary)]
      [@layer_components]:text-[color:var(--primary-foreground)] [@layer_components]:[transform:translateY(-200%)] skip-link
      [@layer_components]:[&:focus]:[transform:translateY(0)]
    `}>Skip to content</a>
    <WorkspaceSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
    <div className="min-w-0 lg:pl-[var(--workspace-sidebar-width)]">
      <WorkspaceMobileNav />
      <div className={`
      workspace-gutter [&&]:pt-[var(--workspace-inset)] [&&]:pr-[var(--workspace-inset)] [&&]:pb-[var(--workspace-inset)]
      [&&]:pl-[var(--workspace-inset)] min-[1024px]:[[data-collapsed='true']_&&]:pl-[0]
    `}>
        <main id="workspace-content" tabIndex={-1} className={`
      workspace-content min-w-0 text-card-foreground outline-none
      max-1023:[&&:has(_>_:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)_)]:h-[calc(_100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2_)]
      max-1023:[&&:has(_>_:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)_)]:min-h-[0]
      max-1023:[&&:has(_>_:is(_[data-workspace-view='marketplace'],_[data-workspace-view='templates'],_[data-workspace-view='template-detail']_)_)]:overflow-hidden
      [&&]:min-h-[calc(100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2)]
      [&&]:[border:1px_solid_var(--border)] [&&]:rounded-[var(--ui-radius-frame)] [&&]:[background:var(--card)]
      [&&:has([data-workspace-page='studio'])]:[border:0] [&&:has([data-workspace-page='studio'])]:[background:transparent]
      [&&:has([data-workspace-page='studio'])]:rounded-[0] min-[1024px]:[&&]:h-[calc(100dvh_-_var(--workspace-inset)_*_2)]
      min-[1024px]:[&&]:min-h-[0] min-[1024px]:[&&]:overflow-y-auto min-[1024px]:[&&]:[scrollbar-width:thin]
      min-[1024px]:[&&]:overscroll-contain
      [&&:has(>_[data-workspace-view='documentation'])]:h-[calc(100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2)]
      [&&:has(>_[data-workspace-view='documentation'])]:min-h-[0]
      [&&:has(>_[data-workspace-view='documentation'])]:overflow-hidden
      min-[1024px]:[&&:has(>_[data-workspace-view='documentation'])]:h-[calc(100dvh_-_var(--workspace-inset)_*_2)]
      [&&:has(>_[data-workspace-view='projects'])]:h-[calc(100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2)]
      [&&:has(>_[data-workspace-view='projects'])]:min-h-[0] [&&:has(>_[data-workspace-view='projects'])]:overflow-y-auto
      [&&:has(>_[data-workspace-view='projects'])]:overscroll-contain
      min-[1024px]:[&&:has(>_[data-workspace-view='projects'])]:h-[calc(100dvh_-_var(--workspace-inset)_*_2)]
      [&&:has(>_[data-workspace-view='settings'])]:h-[calc(100dvh_-_var(--workspace-mobile-header-height)_-_var(--workspace-inset)_*_2)]
      [&&:has(>_[data-workspace-view='settings'])]:min-h-[0] [&&:has(>_[data-workspace-view='settings'])]:overflow-hidden
      min-[1024px]:[&&:has(>_[data-workspace-view='settings'])]:h-[calc(100dvh_-_var(--workspace-inset)_*_2)]
    `}>{children}</main>
      </div>
    </div>
  </div>;
}
