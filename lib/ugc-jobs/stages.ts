import "server-only";
import type { UgcStageHandlers } from "./runner";
import { validateUgcGenerationInput } from "./validation";
import { analyzeJobReferences } from "@/lib/reference-analysis/service";
import { generateCharacterSheet } from "@/lib/character-sheet/service";

export const ugcStageHandlers: UgcStageHandlers = {
  character_reference: generateCharacterSheet,
  analyze_references: analyzeJobReferences,
  validate_inputs: async ({ job }) => {
    const result = await validateUgcGenerationInput(job.project_id, job.owner_user_id, { snapshot: job.input_snapshot });
    return result.ready ? { kind: "validated", snapshot: result.data } : { kind: "fail", code: "INPUT_VALIDATION_FAILED" };
  },
};
