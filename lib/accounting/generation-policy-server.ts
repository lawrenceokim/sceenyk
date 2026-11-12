import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { assertFreeVideoSettings } from "./generation-policy";

export function generationPolicyConfiguration() {
  const value = process.env.HACKATHON_DEMO_MODE ?? "true";
  if (value !== "true" && value !== "false") throw new Error("GENERATION_POLICY_CONFIGURATION_INVALID");
  return { demoMode: value === "true", paidGenerationConnected: true as const, durationSeconds: 5 as const, resolution: "480p" as const };
}

export async function generationAccess(owner: string, project?: string) {
  const configuration = generationPolicyConfiguration();
  const { data, error } = await createDatabaseClient().rpc("generation_project_access", { p_owner: owner, p_project: project ?? null });
  const count = z.number().int().min(0).max(2);
  const parsed = z.object({ policyVersion: z.literal(114), total: z.literal(2), remaining: count, reserved: count, consumed: count,
    projectAllowed: z.boolean(), videoAllowed: z.boolean(), historyReview: z.boolean(), budgetMicrousd: z.number().int().positive().safe(), budgetUsedMicrousd: z.number().int().nonnegative().safe(),
    accountBudgetRemainingMicrousd: z.number().int().min(0).max(2060000).safe(),
    funding: z.enum(["free", "credits"]), requiredCredits: z.union([z.literal(0), z.literal(103)]),
    preparationAllowed: z.boolean(), preparationFunding: z.enum(["free", "credits"]), preparationCredits: z.union([z.literal(0), z.literal(1)]), projectReviewRequired: z.boolean(), projectBlocker: z.string().nullable(),
    availableCredits: z.number().int().nonnegative().safe(), reservedCredits: z.number().int().nonnegative().safe(),
    shortageCredits: z.number().int().min(0).max(103), paidBlocker: z.string().nullable(),
    paidUserRemainingMicrousd: z.number().int().nonnegative().safe(), paidGlobalRemainingMicrousd: z.number().int().nonnegative().safe() })
    .refine(value => value.remaining + value.reserved + value.consumed === 2).safeParse(data);
  if (error || !parsed.success) throw new Error("GENERATION_POLICY_SETUP_REQUIRED");
  return { ...configuration, ...parsed.data };
}

export async function readGenerationAccess(owner: string, project?: string) {
  try { return { ...await generationAccess(owner, project), ready: true, reason: null as string | null }; }
  catch (error) { return { demoMode: true, paidGenerationConnected: true as const, durationSeconds: 5 as const, resolution: "480p" as const,
    ready: false, reason: error instanceof Error && ["GENERATION_POLICY_CONFIGURATION_INVALID", "GENERATION_POLICY_SETUP_REQUIRED"].includes(error.message) ? error.message : "GENERATION_POLICY_SETUP_REQUIRED",
    total: 2, remaining: 0, reserved: 0, consumed: 0, projectAllowed: false, videoAllowed: false, historyReview: false, budgetMicrousd: 0, budgetUsedMicrousd: 0, accountBudgetRemainingMicrousd: 0,
    preparationFunding: "credits" as const, preparationCredits: 1, funding: "free" as const, requiredCredits: 0,
    preparationAllowed: false, projectReviewRequired: false, projectBlocker: null as string | null,
    availableCredits: 0, reservedCredits: 0, shortageCredits: 0, paidBlocker: null as string | null,
    paidUserRemainingMicrousd: 0, paidGlobalRemainingMicrousd: 0 }; }
}

// Successful HTTP generation is charged even if later parsing/publication fails.
// Definitive provider rejection releases once; timeouts never call this receipt.
export async function recordOpenAIGeneration(task: { id: string; lease_token: string | null }, phase = "default", outcome: "completed" | "rejected" = "completed") {
  if (!task.lease_token) throw new Error("V3_LEASE_LOST");
  const { data, error } = await createDatabaseClient().rpc("generation_openai_receipt", {
    p_task: task.id, p_token: task.lease_token, p_phase: phase, p_outcome: outcome,
  });
  if (error || data !== true) {
    console.error("OpenAI accounting receipt unavailable", { taskId: task.id, phase, outcome, code: error?.code });
    throw new Error("PAID_RESERVATION_REQUIRED");
  }
}

export async function dispatchFreeProjectOperation(task: { id: string; lease_token: string | null }, phase = "default") {
  generationPolicyConfiguration();
  if (!task.lease_token) throw new Error("FREE_RESERVATION_REQUIRED");
  const { data, error } = await createDatabaseClient().rpc("free_ai_dispatch", { p_task: task.id, p_token: task.lease_token, p_phase: phase });
  if (error || data !== true) throw new Error(error && /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "FREE_RESERVATION_REQUIRED");
}

export async function freeProjectDispatchStatus(task: { id: string; lease_token: string | null }, phase = "default"): Promise<boolean | null> {
  if (!task.lease_token) return null;
  try {
    const { data, error } = await createDatabaseClient().rpc("free_ai_dispatch_status", { p_task: task.id, p_token: task.lease_token, p_phase: phase });
    return !error && typeof data === "boolean" ? data : null;
  } catch { return null; } // Uncertain database state cannot prove no provider spend.
}

export async function assertFreeV3Transport(project: string, run: string, hash: string, duration: unknown, resolution: unknown) {
  generationPolicyConfiguration();
  if (duration !== 5 || resolution !== "480p") throw new Error("GENERATION_LIMIT_5S_480P");
  const { data, error } = await createDatabaseClient().rpc("generation_free_transport", { p_project: project, p_run: run, p_hash: hash });
  if (error || data !== true) throw new Error("FREE_RESERVATION_REQUIRED");
}

export async function assertFreeV3Submission(owner: string, project: string, run: string, duration: number | string, resolution: string) {
  generationPolicyConfiguration();
  assertFreeVideoSettings(duration, resolution);
  const { data, error } = await createDatabaseClient().rpc("generation_free_submit", { p_owner: owner, p_project: project, p_run: run });
  if (error) {
    const message = /^[A-Z0-9_]{1,100}$/.test(error.message) ? error.message : "GENERATION_POLICY_SETUP_REQUIRED";
    throw new Error(message);
  }
  if (data !== true) throw new Error("FREE_RESERVATION_REQUIRED");
}

// All new legacy provider work is closed until it has an accounted funding path.
// Call only at a new charge boundary, never on result reads or known-request recovery.
export function assertLegacyGenerationUnavailable(): void {
  generationPolicyConfiguration();
  throw new Error("GENERATION_PIPELINE_NOT_SUPPORTED");
}
