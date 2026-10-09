import "server-only";

export class DatabaseConfigurationError extends Error {
  constructor(readonly code: string) {
    super("Application database configuration is unavailable.");
    this.name = "DatabaseConfigurationError";
  }
}

export function getDatabaseConfig() {
  const url = process.env.SUPABASE_URL?.trim();
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (
    process.env.NEXT_PUBLIC_SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new DatabaseConfigurationError("PUBLIC_PRIVILEGED_KEY");
  }
  if (!url || !secretKey)
    throw new DatabaseConfigurationError("MISSING_CONFIGURATION");

  let endpoint: URL;
  try {
    endpoint = new URL(url);
  } catch {
    throw new DatabaseConfigurationError("INVALID_URL");
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname);
  if (
    (endpoint.protocol !== "https:" &&
      !(local && endpoint.protocol === "http:")) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  ) {
    throw new DatabaseConfigurationError("INVALID_URL");
  }

  // This only rejects the wrong key class; Supabase verifies the credential.
  if (!secretKey.startsWith("sb_secret_")) {
    let role: unknown;
    try {
      const payload: unknown = JSON.parse(
        Buffer.from(secretKey.split(".")[1] ?? "", "base64url").toString(),
      );
      if (payload && typeof payload === "object" && "role" in payload)
        role = payload.role;
    } catch {
      // Report a constant configuration code, never the provided value.
    }
    if (role !== "service_role")
      throw new DatabaseConfigurationError("INVALID_PRIVILEGED_KEY");
  }

  return { url: endpoint.origin, secretKey };
}
