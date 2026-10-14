import "server-only";
import { sandboxMarketplacePricing } from "./contract";
export { sandboxMarketplacePricing } from "./contract";

// Arbitrary Sandbox/demo safeguards, not approved production economics.
export function marketplaceDemoFeeBps() {
  const value = process.env.SCEENYK_MARKETPLACE_DEMO_FEE_BPS ?? "0";
  if (!/^\d{1,5}$/.test(value) || Number(value) > 10000) throw new Error("INVALID_MARKETPLACE_DEMO_FEE");
  return Number(value);
}
export function validateMarketplacePrice(type: "free" | "paid", minor: number) {
  if (!Number.isSafeInteger(minor) || (type === "free" ? minor !== 0 : minor < sandboxMarketplacePricing.minMinor || minor > sandboxMarketplacePricing.maxMinor)) {
    throw new Error("Use a Sandbox adoption price from $1.00 to $25.00, or choose Free.");
  }
}
