import { z } from "zod";
import { generationContextSchema, referenceSubjectSchema, type GenerationContext, type ReferenceOriginals } from "./generation-context";
import { v3Digest } from "./identity";
import type { Task } from "./runtime-contract";

export const creativeTaskKinds = ["character", "product", "location", "storyboard"] as const;
export function creativeTaskCurrent(task: Pick<Task, "kind" | "input">, context: GenerationContext, briefHash: string, originals: ReferenceOriginals) {
  const input = z.object({ generationContext: generationContextSchema, briefHash: z.string() }).safeParse(task.input);
  if (!input.success || input.data.briefHash !== briefHash || v3Digest("generation-context", input.data.generationContext) !== v3Digest("generation-context", context)) return false;
  if (["character", "product", "location"].includes(task.kind) && task.input.provider !== undefined && task.input.provider !== "openai") return false;
  if (task.kind === "character" || task.kind === "product") {
    if (task.input.originalId !== originals[task.kind]) return false;
    if (task.input.referenceSubject !== undefined) {
      const subject = referenceSubjectSchema.safeParse(task.input.referenceSubject);
      if (!subject.success || subject.data.role !== task.kind || subject.data.originalId !== originals[task.kind] ||
        subject.data.name !== (originals.names?.[task.kind] ?? "")) return false;
    }
  }
  return true;
}
export function taskBlocksGeneration(task: Pick<Task, "status" | "provider_started">, current: boolean) {
  return ["queued", "running", "reconciliation_required"].includes(task.status) && (current || task.provider_started);
}
