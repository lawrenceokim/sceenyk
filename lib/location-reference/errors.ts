import "server-only";

export type LocationDiagnostic = {
  phase: string; code: string; databaseCode?: string; httpStatus?: number; causeCode?: string;
};
export class LocationError extends Error {
  constructor(readonly code: string, readonly phase: string, readonly diagnostic: LocationDiagnostic = { phase, code }) { super(code); }
}
export function locationFailure(error: unknown, phase: string, code: string) {
  if (error instanceof LocationError) return error;
  const diagnostic: LocationDiagnostic = { phase, code };
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth++) {
    const item = current as Record<string, unknown>;
    if (typeof item.code === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(item.code)) diagnostic.databaseCode = item.code;
    if (typeof item.code === "string" && /^(?:E[A-Z_]{2,40}|UND_ERR_[A-Z_]+)$/.test(item.code)) diagnostic.causeCode = item.code;
    const metadata = item.$metadata as { httpStatusCode?: number } | undefined;
    if (metadata?.httpStatusCode && metadata.httpStatusCode >= 400 && metadata.httpStatusCode <= 599) diagnostic.httpStatus = metadata.httpStatusCode;
    if (item.name === "TimeoutError" || item.name === "AbortError") diagnostic.causeCode = String(item.name);
    current = item.cause;
  }
  return new LocationError(code, phase, diagnostic);
}
