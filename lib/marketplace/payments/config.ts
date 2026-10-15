import "server-only";
import { sandboxMarketplacePricing } from "./contract";
export { sandboxMarketplacePricing } from "./contract";

// Approved production share; the database repeats this for all new intents.
// Historical intents retain their frozen fee and pricing version.
export function marketplaceFeeBps() { return 1000; }
export function validateMarketplacePrice(type: "free" | "paid", minor: number) {
  if (!Number.isSafeInteger(minor) || (type === "free" ? minor !== 0 : minor < sandboxMarketplacePricing.minMinor || minor > sandboxMarketplacePricing.maxMinor)) {
    throw new Error("Use a Sandbox adoption price from $1.00 to $25.00, or choose Free.");
  }
}
