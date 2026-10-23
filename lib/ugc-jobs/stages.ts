import "server-only";
import type { UgcStageHandlers } from "./runner";
import { validateUgcGenerationInput } from "./validation";

export const ugcStageHandlers: UgcStageHandlers = {
  validate_inputs: async ({ job }) => {
    const result = await validateUgcGenerationInput(job.project_id, job.owner_user_id, { snapshot: job.input_snapshot });
    return result.ready ? { kind: "validated", snapshot: result.data } : { kind: "fail", code: "INPUT_VALIDATION_FAILED" };
  },
};
