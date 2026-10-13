import "server-only";
import type { CreditPack } from "./types";

// Temporary hackathon test values, never approved production economics.
// Change IDs when changing values; existing purchases retain their snapshot.
export const sandboxCreditPacks: readonly CreditPack[] = Object.freeze([
  Object.freeze({ id: "sandbox-small-v1", name: "Small Test Pack", amount: "1.00", currency: "USD", credits: 100 }),
  Object.freeze({ id: "sandbox-medium-v1", name: "Medium Test Pack", amount: "3.00", currency: "USD", credits: 350 }),
  Object.freeze({ id: "sandbox-large-v1", name: "Large Test Pack", amount: "5.00", currency: "USD", credits: 650 }),
]);

export function getSandboxPack(id: string) {
  const pack = sandboxCreditPacks.find(pack => pack.id === id);
  if (!pack) throw new Error("INVALID_CREDIT_PACK");
  return pack;
}
