import "server-only";

export type LocationDiagnostic = {
  phase: string; code: string; databaseCode?: string; httpStatus?: number; causeCode?: string;
  category?: "database" | "lease" | "storage" | "provider" | "configuration" | "contract";
};
function locationCategory(code: string, phase: string): NonNullable<LocationDiagnostic["category"]> {
  return code === "LOCATION_DATABASE_FAILED" ? "database" : code === "LOCATION_LEASE_LOST" ? "lease" :
    code === "LOCATION_CONFIG_INVALID" ? "configuration" : code.includes("CLAIM") || code.includes("STATE") || code.includes("CANDIDATE") ? "contract" :
      ["planning", "provider_image"].includes(phase) ? "provider" : "storage";
}
export class LocationError extends Error {
  constructor(readonly code: string, readonly phase: string, readonly diagnostic: LocationDiagnostic = { phase, code, category: locationCategory(code, phase) }) { super(code); }
}
export function locationFailure(error: unknown, phase: string, code: string) {
  if (error instanceof LocationError) return error;
  const diagnostic: LocationDiagnostic = { phase: phase || "claim_validation", code,
    category: locationCategory(code, phase) };
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const item = current as Record<string, unknown>;
    if (typeof item.code === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(item.code)) diagnostic.databaseCode = item.code;
    if (typeof item.code === "string" && /^(?:E[A-Z_]{2,40}|UND_ERR_[A-Z_]+)$/.test(item.code)) diagnostic.causeCode = item.code;
    const metadata = item.$metadata as { httpStatusCode?: number } | undefined;
    if (metadata?.httpStatusCode && metadata.httpStatusCode >= 400 && metadata.httpStatusCode <= 599) diagnostic.httpStatus = metadata.httpStatusCode;
    if (typeof item.status === "number" && item.status >= 400 && item.status <= 599) diagnostic.httpStatus = item.status;
    if (item.name === "TimeoutError" || item.name === "AbortError") diagnostic.causeCode = String(item.name);
    current = item.cause;
  }
  return new LocationError(code, phase, diagnostic);
}
