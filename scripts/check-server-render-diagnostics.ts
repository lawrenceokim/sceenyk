// Synthetic diagnostics only: no private env, requests, browser, DB or worker.
import assert from "node:assert/strict";
import { serverRenderDiagnostic } from "../lib/diagnostics/server-render";

globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN_IN_RENDER_DIAGNOSTICS"); };
let checks = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (value: unknown) => { assert.ok(value); checks++; };
const original = process.env.SCEENYK_DIAGNOSTIC_TEST_SECRET;
try {
  const secret = "synthetic-render-secret-12345";
  process.env.SCEENYK_DIAGNOSTIC_TEST_SECRET = secret;
  const error = new Error(`A fixture render failed with ${secret}; https://private.invalid/image?X-Amz-Signature=fixture`,
    { cause: new TypeError("A synthetic cause with Bearer fixture-credential") });
  Object.assign(error, { digest: "fixture-digest" });
  error.stack = `Error: ${secret}\nA raw source excerpt that must not be logged\n    at FixtureComponent (components/fixture.tsx:12:3)\n    at serverRender (node_modules/fixture/server.js:15:2)`;
  const result = serverRenderDiagnostic(error, { routePath: "/projects/[id]?private=fixture", routeType: "render", renderSource: "server-rendering" });
  equal(result.route, "/projects/[id]"); equal(result.routeType, "render"); equal(result.renderSource, "server-rendering");
  equal(result.name, "Error"); equal(result.digest, "fixture-digest"); equal(result.cause?.name, "TypeError");
  equal(result.frames.length, 2); ok(result.frames[0].includes("FixtureComponent (components/fixture.tsx:12:3)"));
  const json = JSON.stringify(result);
  for (const blocked of [secret, "X-Amz-Signature", "fixture-credential", "raw source excerpt", "private=fixture"])
    equal(json.includes(blocked), false);
  ok(json.includes("[REDACTED]")); ok(json.includes("[REDACTED_URL]")); ok(json.includes("[REDACTED_CREDENTIAL]"));
  const unknown = serverRenderDiagnostic({ arbitraryBody: secret }, { routePath: "/projects", routeType: "render" });
  equal(unknown.message, "Non-Error thrown during server rendering"); equal(JSON.stringify(unknown).includes(secret), false);
  const database = serverRenderDiagnostic(new Error("postgresql://user:password@private.invalid/db rediss://user:password@private.invalid"), { routePath: "/projects", routeType: "render" });
  equal(database.message.includes("password"), false);
  const token = serverRenderDiagnostic(new Error("eyJfixture.abc123.signature"), { routePath: "/projects", routeType: "render" });
  equal(token.message.includes("eyJfixture"), false);
  Object.assign(error, { digest: "https://private.invalid/?secret=value", cause: error });
  const circular = serverRenderDiagnostic(error, { routePath: "/projects", routeType: "render" });
  equal(circular.digest, undefined); equal(circular.cause?.name, "Error");
  equal("cause" in circular.cause!, false);
  const long = new Error("x".repeat(3000)); long.stack = Array(40).fill("    at FixtureComponent (components/fixture.tsx:1:1)").join("\n");
  const bounded = serverRenderDiagnostic(long, { routePath: "/projects", routeType: "render" });
  equal(bounded.message.length, 1200); equal(bounded.frames.length, 12);
} finally { if (original === undefined) delete process.env.SCEENYK_DIAGNOSTIC_TEST_SECRET; else process.env.SCEENYK_DIAGNOSTIC_TEST_SECRET = original; }
console.info(`Server-render diagnostic checks passed: ${checks}; requests/worker/live writes: none`);
