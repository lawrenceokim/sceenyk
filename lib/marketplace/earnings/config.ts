import "server-only";
import { settlementPolicySchema } from "./contract";
export function sandboxSettlementPolicy() {
  // Explicit Sandbox/demo timing, never a production holding-period decision.
  const raw = process.env.SCEENYK_MARKETPLACE_TEST_SETTLEMENT_SECONDS ?? "300";
  if (!/^\d{2,5}$/.test(raw)) throw new Error("INVALID_SANDBOX_SETTLEMENT_POLICY");
  const holdSeconds = Number(raw);
  return settlementPolicySchema.parse({ version: `sandbox-settlement-v1:${holdSeconds}`, holdSeconds });
}
