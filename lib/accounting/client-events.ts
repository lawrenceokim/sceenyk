"use client";

export const creditRefreshKey = "sceenyk:credits-changed";

// Invalidation only. Never persist a balance, quote, identity or payment token.
export function notifyCreditsChanged() {
  window.dispatchEvent(new Event("sceenyk:credits"));
  try { localStorage.setItem(creditRefreshKey, crypto.randomUUID()); } catch { /* Activation still refreshes when storage is unavailable. */ }
}
