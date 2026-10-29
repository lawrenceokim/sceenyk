// Development-only callers. Never include request headers, cookies, bodies or
// arbitrary error objects in render diagnostics.
export function serverRenderDiagnostic(error: unknown, context: { routePath: string; routeType: string; renderSource?: string }) {
  const secrets = Object.entries(process.env).filter(([key, value]) => /SECRET|TOKEN|API_KEY|SIGNING_KEY|ACCESS_KEY|FAL_KEY|DATABASE_URL/.test(key) && value && value.length >= 4).map(([, value]) => value!);
  const clean = (value: string) => {
    let result = value;
    for (const secret of secrets) result = result.replaceAll(secret, "[REDACTED]");
    const root = process.env.USERPROFILE;
    if (root) result = result.replaceAll(root, "[local]").replaceAll(root.replaceAll("\\", "/"), "[local]");
    return result.replace(/(?:https?|postgres(?:ql)?|rediss?):\/\/[^\s"')]+/gi, "[REDACTED_URL]")
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, "[REDACTED_TOKEN]")
      .replace(/(?:Bearer|Basic)\s+[^\s,;"<>]+/gi, "[REDACTED_CREDENTIAL]")
      .replace(/(?:xi-api-key|api[_-]?key|access[_-]?token|authorization|x-amz-[\w-]+)["'\s:=]+[^\s,;"<>]+/gi, "[REDACTED_CREDENTIAL]")
      .replace(/\b(?:sk_|sk-|sb_secret_)[a-zA-Z0-9_-]+/g, "[REDACTED_CREDENTIAL]")
      .replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 1200);
  };
  const item = (value: unknown) => {
    const e = value instanceof Error ? value : null;
    return { name: e && /^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(e.name) ? e.name : "Error",
      message: e ? clean(e.message) : "Non-Error thrown during server rendering",
      frames: e?.stack?.split("\n").filter(line => /^\s+at\s/.test(line)).slice(0, 12).map(clean) ?? [] };
  };
  const e = error instanceof Error ? error : null;
  const digest = e && "digest" in e && typeof e.digest === "string" && /^[a-zA-Z0-9_.:-]{1,160}$/.test(e.digest) ? e.digest : undefined;
  return { route: clean(context.routePath.split("?")[0]), routeType: context.routeType, renderSource: context.renderSource,
    digest, ...item(error), cause: e?.cause ? item(e.cause) : undefined };
}
