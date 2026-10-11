import type { z } from "zod";
import type { generationInputsSchema } from "./validation";
import type { DispatchStatus } from "./dispatch-contract";
import type {
  GenerationFailureCode,
  GenerationStage,
  GenerationStatus,
} from "./contract";

export type GenerationInputs = z.output<typeof generationInputsSchema>;
export type GenerationSnapshot = GenerationInputs & { version: 1 };
export type GenerationJob = {
  productionPlanReadyAt: string | null;
  id: string;
  requestId: string;
  projectId: string;
  status: GenerationStatus;
  dispatchStatus: DispatchStatus;
  stage: GenerationStage | null;
  input: GenerationSnapshot;
  errorCode: GenerationFailureCode | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
export type GenerationVersion = Pick<GenerationJob, "status" | "stage">;
export type GenerationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code:
        | "INVALID_INPUT"
        | "NOT_FOUND"
        | "INVALID_ASSETS"
        | "CONFLICT"
        | "PAID_ACCESS_UNAVAILABLE"
        | "INSUFFICIENT_CREDITS"
        | "QUOTE_STALE"
        | "UNAVAILABLE";
      message: string;
    };
