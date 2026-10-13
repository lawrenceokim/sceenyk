import "server-only";

// A presentation threshold, never an admission or automatic-charge rule.
export function lowCreditThreshold(): number {
  const value = process.env.SCEENYK_LOW_CREDIT_THRESHOLD;
  if (value === undefined || value === "") return 25;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("INVALID_LOW_CREDIT_THRESHOLD");
  return parsed;
}
