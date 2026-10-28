import { FinalVideoError } from "./contract";

export type FinalConfigurationReason = "final_video_disabled" | "local_execution_required" | "operator_funding_disabled" |
  "authorization_missing" | "authorization_invalid_json" | "authorization_invalid";
export type AuthorizationIssue = { field: string; rule: string };

// Only constant reasons and allowlisted field/rule names belong here. Never keep
// a Zod error, supplied value, JSON body, credential or arbitrary error message.
export class FinalConfigurationError extends FinalVideoError {
  constructor(code: "FINAL_SETUP_REQUIRED" | "FINAL_FUNDING_REQUIRED", readonly reason: FinalConfigurationReason,
    readonly issues: AuthorizationIssue[] = []) { super(code, 503); }
}
export function finalConfigurationDiagnostic(error: unknown) {
  if (error instanceof FinalConfigurationError) return { code: error.code, reason: error.reason, issues: error.issues };
  if (error instanceof FinalVideoError && error.code === "FINAL_PROVIDER_CONFIGURATION")
    return { code: error.code, reason: "provider_funding_unavailable" as const };
  if (error instanceof FinalVideoError && error.code === "FINAL_CONFIGURATION_CHANGED")
    return { code: error.code, reason: "authorization_stale" as const };
  return null;
}
