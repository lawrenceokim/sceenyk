"use server";
import { unstable_rethrow } from "next/navigation";
import {
  createGenerationJob,
  getLatestProjectGeneration,
  getOwnedGenerationJob,
} from "@/lib/generation/server";
import type { GenerationJob, GenerationResult } from "@/lib/generation/types";
import type { ProjectCardStatus } from "@/lib/projects/card-status";
import { getProjectCardStatuses } from "@/lib/projects/card-status-server";

async function safely<T>(
  operation: () => Promise<T>,
): Promise<GenerationResult<T>> {
  try {
    return { ok: true, value: await operation() };
  } catch (error: unknown) {
    unstable_rethrow(error);
    console.error("Generation request failed.", { code: "UNAVAILABLE" });
    return {
      ok: false,
      code: "UNAVAILABLE",
      message:
        "Generation status couldn’t be confirmed. Check your connection and try again.",
    };
  }
}
export async function createGenerationAction(
  input: unknown,
): Promise<GenerationResult<GenerationJob>> {
  const result = await safely(() => createGenerationJob(input));
  return result.ok ? result.value : result;
}
export async function latestGenerationAction(
  projectId: unknown,
): Promise<GenerationResult<GenerationJob | null>> {
  return safely(() => getLatestProjectGeneration(projectId));
}
export async function readGenerationAction(
  input: unknown,
): Promise<GenerationResult<GenerationJob | null>> {
  return safely(() => getOwnedGenerationJob(input));
}
export async function generationStatusesAction(
  input: unknown,
): Promise<GenerationResult<Record<string, ProjectCardStatus>>> {
  return safely(() => getProjectCardStatuses(input));
}
