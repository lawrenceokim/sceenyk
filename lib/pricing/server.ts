import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { createGenerationSchema } from "@/lib/generation/validation";
import type { GenerationResult } from "@/lib/generation/types";
import { quoteGenerationCost } from "./config";
import type { GenerationQuote } from "./types";

export async function quoteGeneration(
  input: unknown,
): Promise<GenerationResult<GenerationQuote>> {
  const user = await ensureAppUser();
  const parsed = createGenerationSchema.safeParse(input);
  if (!parsed.success) return {
    ok: false,
    code: "INVALID_INPUT",
    message: "Enter a prompt and check your settings and uploaded media.",
  };
  const { projectId, requestId, inputs } = parsed.data;
  const snapshot = { version: 1 as const, ...inputs };
  const cost = quoteGenerationCost(snapshot);
  const { data, error } = await createDatabaseClient().rpc("issue_generation_quote", {
    p_owner_user_id: user.id,
    p_project_id: projectId,
    p_request_id: requestId,
    p_snapshot: snapshot,
    p_credit_cost: cost.requiredCredits,
    p_pricing_version: cost.pricingVersion,
    p_pricing_mode: cost.pricingMode,
  });
  if (error || !data) throw new Error("QUOTE_UNAVAILABLE");
  if (data.code === "NOT_FOUND") return {
    ok: false, code: "NOT_FOUND", message: "This project is unavailable.",
  };
  if (data.code === "INVALID_ASSETS") return {
    ok: false, code: "INVALID_ASSETS",
    message: "Refresh your uploaded project media and try again.",
  };
  if (data.code !== "QUOTED" || !data.quote)
    throw new Error("QUOTE_UNAVAILABLE");
  const q = data.quote;
  return { ok: true, value: {
    id: q.id,
    eligibleFreeGeneration: q.eligible_free,
    requiredCredits: q.required_credits,
    availableCredits: q.available_credits,
    freeGenerationsRemaining: q.free_remaining,
    pricingVersion: q.pricing_version,
    pricingMode: q.pricing_mode,
    status: q.eligible_free || (
      q.required_credits !== null && q.available_credits >= q.required_credits
    ) ? "ready"
      : q.required_credits === null
        ? "pricing_unavailable"
        : "insufficient_credits",
    expiresAt: q.expires_at,
    breakdown: cost.breakdown,
  } };
}
