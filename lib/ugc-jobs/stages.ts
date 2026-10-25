import "server-only";
import type { UgcStageHandlers } from "./runner";
import { validateUgcGenerationInput } from "./validation";
import { analyzeJobReferences } from "@/lib/reference-analysis/service";
import { startCharacterV5 } from "@/lib/character-v5/worker";
import { generateProductSheet } from "@/lib/product-sheet/service";

export const ugcStageHandlers: UgcStageHandlers = {
  product_reference: generateProductSheet,
  character_reference: startCharacterV5,
  analyze_references: analyzeJobReferences,
  validate_inputs: async ({ job }) => {
    const result = await validateUgcGenerationInput(job.project_id, job.owner_user_id, { snapshot: job.input_snapshot });
    return result.ready ? { kind: "validated", snapshot: result.data } : { kind: "fail", code: "INPUT_VALIDATION_FAILED" };
  },
};
