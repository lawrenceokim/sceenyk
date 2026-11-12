"use client";

export const creditRefreshKey = "sceenyk:credits-changed";

// Invalidation only. Never persist a balance, quote, identity or payment token.
export function notifyCreditsChanged(confirmedWallet = false) {
  window.dispatchEvent(new CustomEvent("sceenyk:credits", { detail: { confirmedWallet } }));
  try { localStorage.setItem(creditRefreshKey, crypto.randomUUID()); } catch { /* Activation still refreshes when storage is unavailable. */ }
}
