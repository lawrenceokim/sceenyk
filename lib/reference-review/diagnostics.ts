import "server-only";
import { z } from "zod";
import { characterOutputReasons } from "@/lib/character-sheet/contract";
import { CharacterSheetError } from "@/lib/character-sheet/provider";
import { productFailureCodes } from "@/lib/product-sheet/contract";
import { ProductSheetError } from "@/lib/product-sheet/provider";
import { ReferenceMediaError } from "@/lib/reference-analysis/media";
import { UgcWorkerDatabaseError } from "@/lib/ugc-jobs/database-diagnostics";

export const regenerationPhases = ["claim_validation", "job_read", "snapshot_validation", "sheet_read", "base_validation", "requests_read",
  "request_validation", "replacement_lookup", "identity_reuse", "analysis_read", "analysis_validation", "provider_configuration",
  "checkpoint_validation", "provider_submit", "provider_poll", "output_download", "output_decode", "view_storage", "view_publication",
  "sheet_lookup", "sheet_inputs_read", "sheet_composition", "sheet_storage", "sheet_publication", "database_checkpoint", "heartbeat",
  "recovery_front_validating", "recovery_back_loading", "recovery_face_loading", "recovery_sheet_validating", "recovery_sheet_rebuilding", "recovery_sheet_saving"] as const;
export type RegenerationPhase = typeof regenerationPhases[number];
export const regenerationFailureCodes = ["CHARACTER_SHEET_RECOVERY_FAILED", "CHARACTER_SHEET_COMPOSITION_FAILED", "REGENERATION_INPUT_INVALID", "REGENERATION_SNAPSHOT_INVALID", "REGENERATION_SHEET_INVALID",
  "REGENERATION_CHECKPOINT_INVALID", "REGENERATION_LEASE_LOST", "REGENERATION_DATABASE_FAILED", "REGENERATION_UNEXPECTED_FAILURE",
  "IDENTITY_UNAVAILABLE", "RECONCILIATION_REQUIRED", "REFERENCE_ASSET_INVALID", "REFERENCE_ASSET_INTEGRITY_FAILED",
  "REFERENCE_ASSET_SIZE_INVALID", "REFERENCE_ASSET_DECODE_FAILED", "REFERENCE_STORAGE_READ_TIMEOUT", "REFERENCE_STORAGE_READ_FAILED",
  "REFERENCE_STORAGE_WRITE_FAILED", "REFERENCE_STORAGE_WRITE_TIMEOUT", "REFERENCE_STORAGE_NOT_FOUND", "REFERENCE_STORAGE_PERMISSION_FAILED", "REFERENCE_SOURCE_UNAVAILABLE",
  "CHARACTER_CONFIG_INVALID", "CHARACTER_AUTH_FAILED", "CHARACTER_RATE_LIMITED", "CHARACTER_PROVIDER_FAILED", "CHARACTER_TIMEOUT",
  "CHARACTER_OUTPUT_INVALID", "CHARACTER_STORAGE_FAILED", "CHARACTER_COMPOSITION_FAILED", ...characterOutputReasons, ...productFailureCodes] as const;
export type RegenerationFailureCode = typeof regenerationFailureCodes[number];
export const regenerationDiagnosticSchema = z.strictObject({
  version: z.literal(1), phase: z.enum(regenerationPhases), code: z.enum(regenerationFailureCodes),
  view: z.enum(["front", "back", "face", "primary", "angle", "detail"]).optional(),
  category: z.enum(["database", "validation", "provider", "storage", "composition", "lease", "internal"]),
  httpStatus: z.number().int().min(100).max(599).optional(),
});
export type RegenerationDiagnostic = z.infer<typeof regenerationDiagnosticSchema>;
export class ReferenceRegenerationError extends Error {
  constructor(readonly code: RegenerationFailureCode) { super(code); }
}

export function regenerationDiagnostic(error: unknown, phase: RegenerationPhase, view?: string): RegenerationDiagnostic {
  let code: RegenerationFailureCode = "REGENERATION_UNEXPECTED_FAILURE";
  let category: RegenerationDiagnostic["category"] = "internal";
  let httpStatus: number | undefined;
  if (error instanceof UgcWorkerDatabaseError) {
    code = "REGENERATION_DATABASE_FAILED"; category = "database";
    if (error.diagnostic.phase === "regeneration_checkpoint" && phase !== "heartbeat") phase = "database_checkpoint";
  }
  else if (error instanceof ReferenceRegenerationError) {
    code = error.code; category = code.includes("LEASE") ? "lease" : code.includes("STORAGE") || code.includes("ASSET") ? "storage" : "validation";
  } else if (error instanceof CharacterSheetError) {
    code = error.diagnostic?.reason ?? error.code;
    category = phase === "sheet_composition" || phase === "recovery_sheet_rebuilding" ? "composition" : phase.includes("storage") ? "storage" : "provider";
    httpStatus = error.diagnostic?.httpStatus ?? undefined;
  } else if (error instanceof ProductSheetError) {
    code = error.code; category = phase === "sheet_composition" ? "composition" : phase.includes("storage") ? "storage" : "provider";
    httpStatus = error.diagnostic.httpStatus;
  } else if (error instanceof ReferenceMediaError) { code = "REFERENCE_SOURCE_UNAVAILABLE"; category = "storage"; }
  else if (error instanceof z.ZodError) {
    code = phase === "snapshot_validation" ? "REGENERATION_SNAPSHOT_INVALID" : phase === "checkpoint_validation" ? "REGENERATION_CHECKPOINT_INVALID" : "REGENERATION_SHEET_INVALID";
    category = "validation";
  } else if (error instanceof Error && regenerationFailureCodes.includes(error.message as RegenerationFailureCode)) {
    code = error.message as RegenerationFailureCode; category = code.includes("LEASE") ? "lease" : "validation";
  } else if (phase === "sheet_composition") { category = "composition"; }
  return regenerationDiagnosticSchema.parse({ version: 1, phase, code, category,
    ...(["front", "back", "face", "primary", "angle", "detail"].includes(view ?? "") ? { view } : {}),
    ...(httpStatus ? { httpStatus } : {}) });
}
