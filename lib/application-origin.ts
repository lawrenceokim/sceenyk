import "server-only";

const loopback = (host: string) => host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || host === "0.0.0.0" || /^127\./.test(host);
const deployed = () => process.env.VERCEL === "1" || ["preview", "production"].includes(process.env.VERCEL_ENV ?? "");

// Reuse the existing administrator origin; never accept a redirect URL from
// a browser payload, arbitrary Host header or another project's vercel.app URL.
export function validateApplicationOrigin(value: string) {
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("APPLICATION_ORIGIN_INVALID"); }
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
    deployed() && loopback(url.hostname) ||
    url.protocol !== "https:" && !(url.protocol === "http:" && !deployed() && loopback(url.hostname))) {
    throw new Error("APPLICATION_ORIGIN_INVALID");
  }
  return url.origin;
}

function platformOrigin(name: "VERCEL_URL" | "VERCEL_BRANCH_URL" | "VERCEL_PROJECT_PRODUCTION_URL") {
  const host = process.env[name];
  if (!host) return undefined;
  // These platform variables contain a hostname, not a URL/path/credential.
  if (!/^[a-zA-Z0-9.-]+(?::\d+)?$/.test(host)) throw new Error("APPLICATION_ORIGIN_INVALID");
  return validateApplicationOrigin(`https://${host}`);
}

export function applicationOrigin() {
  if (deployed() && process.env.VERCEL_ENV !== "production") {
    const preview = platformOrigin("VERCEL_URL") ?? platformOrigin("VERCEL_BRANCH_URL");
    if (preview) return preview;
  }
  if (process.env.PAYPAL_RETURN_ORIGIN?.trim()) return validateApplicationOrigin(process.env.PAYPAL_RETURN_ORIGIN.trim());
  if (deployed()) {
    const origin = (process.env.VERCEL_ENV === "production" ? platformOrigin("VERCEL_PROJECT_PRODUCTION_URL") : undefined) ?? platformOrigin("VERCEL_URL");
    if (origin) return origin;
    throw new Error("APPLICATION_ORIGIN_REQUIRED");
  }
  if (process.env.NODE_ENV === "production") throw new Error("APPLICATION_ORIGIN_REQUIRED");
  return "http://localhost:3000";
}

export function checkoutOrigin(origin?: string | null, host?: string | null) {
  const fallback = applicationOrigin();
  const allowed = new Set([fallback]);
  if (process.env.PAYPAL_RETURN_ORIGIN?.trim()) allowed.add(validateApplicationOrigin(process.env.PAYPAL_RETURN_ORIGIN.trim()));
  if (deployed()) {
    for (const name of ["VERCEL_URL", "VERCEL_BRANCH_URL"] as const) {
      const value = platformOrigin(name); if (value) allowed.add(value);
    }
    if (process.env.VERCEL_ENV === "production") {
      const value = platformOrigin("VERCEL_PROJECT_PRODUCTION_URL"); if (value) allowed.add(value);
    }
  }
  if (origin) {
    const value = validateApplicationOrigin(origin);
    if (!allowed.has(value)) throw new Error("APPLICATION_ORIGIN_UNTRUSTED");
    return value;
  }
  // A missing Origin may use a matching configured host, never an arbitrary one.
  return [...allowed].find(value => new URL(value).host === host) ?? fallback;
}
