import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { assertFreeVideoSettings } from "./generation-policy";

export function generationPolicyConfiguration() {
  const value = process.env.HACKATHON_DEMO_MODE ?? "true";
  if (value !== "true" && value !== "false") throw new Error("GENERATION_POLICY_CONFIGURATION_INVALID");
  return { demoMode: value === "true", paidGenerationConnected: false as const, durationSeconds: 5 as const, resolution: "480p" as const };
}

export async function generationAccess(owner: string) {
  const configuration = generationPolicyConfiguration();
  const { data, error } = await createDatabaseClient().rpc("generation_free_access", { p_owner: owner });
  const count = z.number().int().min(0).max(2);
  const parsed = z.object({ total: z.literal(2), remaining: count, reserved: count, consumed: count,
    preparationRemaining: z.object({ character: count, product: count, location: count, storyboard: count }) })
    .refine(value => value.remaining + value.reserved + value.consumed === 2).safeParse(data);
  if (error || !parsed.success) throw new Error("GENERATION_POLICY_SETUP_REQUIRED");
  return { ...configuration, ...parsed.data };
}

export async function readGenerationAccess(owner: string) {
  try { return { ...await generationAccess(owner), ready: true, reason: null as string | null }; }
  catch (error) { return { demoMode: true, paidGenerationConnected: false as const, durationSeconds: 5 as const, resolution: "480p" as const,
    ready: false, reason: error instanceof Error && ["GENERATION_POLICY_CONFIGURATION_INVALID", "GENERATION_POLICY_SETUP_REQUIRED"].includes(error.message) ? error.message : "GENERATION_POLICY_SETUP_REQUIRED",
    total: 2, remaining: 0, reserved: 0, consumed: 0, preparationRemaining: { character: 0, product: 0, location: 0, storyboard: 0 } }; }
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
