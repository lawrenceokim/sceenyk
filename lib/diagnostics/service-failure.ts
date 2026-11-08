import "server-only";

export type ServiceName = "database" | "clerk" | "storage";
export type ServiceDiagnostic = {
  service: ServiceName; operation: string;
  category: "configuration" | "authentication" | "permission" | "schema" | "constraint" | "network_permission" | "tls" | "network" | "timeout" | "capacity" | "rate_limit" | "unavailable" | "not_found" | "unknown";
  retryable: boolean; upstreamStatus: number | null; upstreamCode: string | null; transportCode: string | null;
};
const transports = ["EACCES", "EPERM", "ECONNREFUSED", "ECONNRESET", "EPIPE", "ENETUNREACH", "EHOSTUNREACH", "ENOTFOUND", "EAI_AGAIN", "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT", "UND_ERR_SOCKET", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID"];
const sqlCode = /^(?:[0-9]{2}[0-9A-Z]{3}|P0[0-9A-Z]{3}|XX[0-9A-Z]{3}|PGRST[0-9]{3})$/;
const configurationCodes = ["PUBLIC_PRIVILEGED_KEY", "MISSING_CONFIGURATION", "INVALID_URL", "INVALID_PRIVILEGED_KEY"];

// Read upstream text only for classification. Never return it, even as Error.cause.
export function serviceDiagnostic(error: unknown, service: ServiceName, operation: string, status?: number): ServiceDiagnostic {
  if (error instanceof ServiceOperationError) return error.diagnostic;
  const values: Record<string, unknown>[] = [], visited = new Set<unknown>();
  function visit(value: unknown, depth = 0) {
    if (!value || typeof value !== "object" || visited.has(value) || depth > 5 || values.length >= 16) return;
    visited.add(value); const item = value as Record<string, unknown>; values.push(item);
    visit(item.cause, depth + 1);
    if (Array.isArray(item.errors)) for (const child of item.errors.slice(0, 4)) visit(child, depth + 1);
  }
  visit(error);
  const codes = values.map(v => typeof v.code === "string" ? v.code : "");
  const text = values.flatMap(v => [v.message, v.details, v.hint, v.name]).filter((s): s is string => typeof s === "string").map(s => s.slice(0, 4096)).join(" ");
  const transportCode = transports.find(code => codes.includes(code) || new RegExp(`\\b${code}\\b`).test(text)) ?? null;
  const upstreamCode = codes.find(code => sqlCode.test(code) || configurationCodes.includes(code)) ?? null;
  const statuses = [status, ...values.flatMap(v => [v.status, v.statusCode, (v.$metadata as { httpStatusCode?: unknown } | undefined)?.httpStatusCode])];
  const upstreamStatus = statuses.find((s): s is number => typeof s === "number" && Number.isInteger(s) && s >= 100 && s <= 599) ?? null;
  let category: ServiceDiagnostic["category"] = "unknown", retryable = false;
  if (codes.some(c => configurationCodes.includes(c)) || /(?:Database|Storage)ConfigurationError/.test(text)) category = "configuration";
  else if (["EACCES", "EPERM"].includes(transportCode ?? "")) category = "network_permission";
  else if (transportCode && /CERT|TLS|VERIFY_LEAF/.test(transportCode)) category = "tls";
  else if (upstreamStatus === 401 || upstreamCode?.startsWith("28") || ["PGRST301", "PGRST302", "PGRST303"].includes(upstreamCode ?? "") || /(?:InvalidAccessKeyId|SignatureDoesNotMatch|CredentialsProviderError)/.test(text)) category = "authentication";
  else if (upstreamStatus === 403 || upstreamCode === "42501" || /\bAccessDenied\b/.test(text)) category = "permission";
  else if (upstreamCode?.startsWith("23")) category = "constraint";
  else if (["PGRST202", "PGRST203", "PGRST204", "PGRST205", "PGRST106"].includes(upstreamCode ?? "") || upstreamCode && /^(22|42|P0)/.test(upstreamCode)) category = "schema";
  else if (upstreamStatus === 404) category = "not_found";
  else if (upstreamStatus === 429) { category = "rate_limit"; retryable = true; }
  else if (upstreamCode === "53300" || ["PGRST000", "PGRST001", "PGRST002", "PGRST003"].includes(upstreamCode ?? "")) { category = "capacity"; retryable = true; }
  else if (upstreamCode === "57014" || transportCode === "ETIMEDOUT" || /TIMEOUT/.test(transportCode ?? "") || /\b(?:TimeoutError|AbortError)\b/.test(text)) { category = "timeout"; retryable = true; }
  else if (transportCode) { category = "network"; retryable = true; }
  else if (upstreamCode?.startsWith("08") || ["57P01", "57P02", "57P03"].includes(upstreamCode ?? "")) { category = "unavailable"; retryable = true; }
  else if (!upstreamCode && upstreamStatus !== null && [408, 500, 502, 503, 504].includes(upstreamStatus)) { category = "unavailable"; retryable = true; }
  return { service, operation: /^[a-z0-9_]{1,100}$/.test(operation) ? operation : "operation", category, retryable, upstreamStatus, upstreamCode, transportCode };
}
const suffix: Record<ServiceDiagnostic["category"], string> = {
  configuration: "CONFIGURATION_INVALID", authentication: "AUTHENTICATION_FAILED", permission: "PERMISSION_DENIED", schema: "SCHEMA_MISMATCH", constraint: "CONSTRAINT_REJECTED",
  network_permission: "NETWORK_BLOCKED", tls: "TLS_INVALID", network: "CONNECTION_UNAVAILABLE", timeout: "TIMEOUT", capacity: "CAPACITY_UNAVAILABLE",
  rate_limit: "RATE_LIMITED", unavailable: "UNAVAILABLE", not_found: "NOT_FOUND", unknown: "OPERATION_FAILED",
};
export class ServiceOperationError extends Error {
  readonly diagnostic: ServiceDiagnostic;
  readonly code: string;
  constructor(error: unknown, service: ServiceName, operation: string, prefix = service.toUpperCase(), code?: string, status?: number) {
    const diagnostic = serviceDiagnostic(error, service, operation, status);
    const safeCode = code ?? `${prefix}_${suffix[diagnostic.category]}`;
    super(safeCode); this.name = "ServiceOperationError"; this.code = safeCode; this.diagnostic = diagnostic;
  }
}
export function serviceFailureMessage(diagnostic: ServiceDiagnostic) {
  const name = diagnostic.service === "clerk" ? "Your account profile" : diagnostic.service === "database" ? "The application database" : "Media storage";
  if (diagnostic.retryable) return `${name} is temporarily unavailable. Your saved work is preserved. Please try again shortly.`;
  if (["configuration", "authentication", "permission", "schema", "tls", "network_permission"].includes(diagnostic.category)) return `${name} needs administrator attention. Your saved work is preserved.`;
  if (diagnostic.category === "not_found") return `${name} could not be verified. Your saved work is preserved; ask an administrator to check the saved account or media.`;
  return `${name} could not complete this operation. Your saved work is preserved; check the service diagnostics before retrying.`;
}
