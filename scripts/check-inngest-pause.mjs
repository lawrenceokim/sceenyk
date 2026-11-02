// Offline shutdown checks: no credentials, database, Cloud or providers.
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; };
let network = 0, database = 0, sends = 0, authentication = 0;
const forbiddenFetch = async () => { network++; throw new Error("UNEXPECTED_NETWORK"); };
const forbiddenDatabase = () => { database++; throw new Error("UNEXPECTED_DATABASE"); };
const env = { NODE_ENV: "production", SCEENYK_LOCAL_JOBS_ONLY: "0", INNGEST_DEV: "1", INNGEST_EVENT_KEY: "fixture" };
const globals = { Response, fetch: forbiddenFetch, process: { env } };
const load = typescriptLoader({}, globals);
const policy = load("lib/workflows/execution-policy.ts");
check(!policy.localJobsOnly(), "test explicitly bypasses the old environment guard");
for (const mode of ["production", "development", "test"]) {
  env.NODE_ENV = mode;
  check(policy.inngestExecutionPaused(), `${mode} cannot bypass the code pause`);
}
env.NODE_ENV = "production";

// Any accidental import of the SDK/services fails: the route must stand alone.
const ingress = typescriptLoader({ "inngest/next": new Proxy({}, { get() { throw new Error("SDK_LOADED"); } }) }, globals)("app/api/inngest/route.ts");
const request = new Proxy({}, { get() { throw new Error("REQUEST_BODY_READ"); } });
for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
  const response = await ingress[method](request, {});
  check(response.status === 204 && await response.text() === "", `${method} immediately acknowledges without work`);
  check(response.headers.get("X-Sceenyk-Inngest") === "temporarily-disabled", `${method} identifies the pause`);
}

// Exercise the real configured SDK transport callback, including a stale
// production environment that would have enabled the old workflow code.
let sdkFetch;
typescriptLoader({ inngest: { Inngest: class { constructor(options) { sdkFetch = options.fetch; } } } }, globals)("lib/workflows/client.ts");
for (const url of ["https://inn.gs/e/fixture", "https://api.inngest.com/fn/register", "http://localhost:8288/e/fixture"]) {
  await assert.rejects(sdkFetch(url, { method: "POST" }), /WORKFLOW_EXECUTION_DISABLED/);
  checks++;
}

const stubs = {
  "@/lib/db/server": { createDatabaseClient: forbiddenDatabase },
  "@/lib/workflows/client": { inngest: { send: async () => { sends++; throw new Error("UNEXPECTED_SEND"); } }, workflowDevelopmentMode: () => false },
  "@/lib/auth/ensure-app-user": { ensureAppUser: async () => { authentication++; return { id: randomUUID() }; } },
};
const services = typescriptLoader(stubs, globals);
const dispatch = services("lib/generation/dispatch.ts");
for (let attempt = 0; attempt < 5; attempt++) {
  await dispatch.dispatchGeneration(randomUUID());
  await dispatch.attemptGenerationDispatch(randomUUID());
}
check(sends === 0 && database === 0, "repeated dispatch cannot send or reserve/acknowledge outbox rows");
const admission = await services("lib/generation/server.ts").createGenerationJob({ quoteId: randomUUID() });
check(authentication === 1, "legacy admission still authenticates");
check(!admission.ok && admission.message === "Background generation is temporarily paused.", "legacy admission reports the pause");
check(database === 0, "paused admission cannot hold credits or create stranded jobs");

const config = JSON.parse(fs.readFileSync("vercel.json", "utf8"));
const terminal = config.routes[0];
check(terminal.status === 204 && !terminal.dest && !terminal.continue && !terminal.methods, "first deployment rule terminates every method without a function destination");
const matcher = new RegExp(terminal.src);
for (const pathname of ["/api/ingest", "/api/inngest", "/api/ingest/", "/api/inngest/", "/api/inngest/stale"]) {
  check(matcher.test(pathname), `deployment rule covers ${pathname}`);
}
for (const pathname of ["/api/ugc/v3", "/api/ugc/progress", "/api/payments/paypal/webhook", "/api/inngestion", "/projects", "/settings"]) {
  check(!matcher.test(pathname), `deployment rule preserves ${pathname}`);
}
check(config.routes[1].continue === true && config.routes[1].transforms.length === 2, "existing private response rule is retained");

const cloudScripts = [
  "acceptance-creator-withdrawals-hosted.mjs", "acceptance-marketplace-settlement.mjs",
  "check-caption-cloud.mjs", "check-deployed-analysis.mjs", "check-deployed-composition.mjs",
  "check-deployed-final-render.mjs", "check-deployed-narration.mjs", "check-deployed-preparation.mjs",
];
for (const file of cloudScripts) {
  check(fs.readFileSync(`scripts/${file}`, "utf8").startsWith("import './lib/inngest-paused.mjs';"), `${file} is guarded before environment loading and work`);
  await assert.rejects(import(new URL(file, import.meta.url)), /INNGEST_TEMPORARILY_DISABLED/);
  checks++;
}
check(network === 0 && database === 0 && sends === 0, "all shutdown checks made zero network/database/event calls");
console.log(JSON.stringify({ passed: checks, networkCalls: network, databaseCalls: database, eventSends: sends }));
