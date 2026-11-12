// Offline access-mode/identity regression. No env files, services or providers.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { typescriptLoader } from "./lib/load-typescript.mjs";

let checks = 0;
const equal = (actual, expected) => { assert.deepEqual(actual, expected); checks++; };
const owner = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const project = "00000000-0000-4000-8000-000000000003";
const env = {};
const load = typescriptLoader({}, { process: { env } });
const access = load("lib/final-video-generation-v3/runtime-config.ts");
const configure = values => { for (const name of Object.keys(env)) delete env[name]; Object.assign(env, values); };
const enabled = { UGC_V3_ENABLED: "1", UGC_V3_OPERATOR_USER_ID: owner };

for (const mode of [undefined, "operator"]) {
  configure({ ...enabled, NODE_ENV: "development", ...(mode ? { UGC_V3_ACCESS_MODE: mode } : {}) });
  equal(access.v3UserAllowed(owner), true);
  equal(access.v3UserAllowed(other), false);
  env.NODE_ENV = "production"; env.VERCEL_ENV = "preview";
  equal(access.v3RuntimeEnabled(), false);
  assert.throws(() => access.assertV3Access(owner), /V3_ACCESS_UNAVAILABLE/); checks++;
}
for (const target of ["preview", "production"]) {
  configure({ NODE_ENV: "production", VERCEL_ENV: target, UGC_V3_ENABLED: "1", UGC_V3_ACCESS_MODE: "owned" });
  equal(access.v3RuntimeEnabled(), true);
  equal(access.v3UserAllowed(owner), true);
  equal(access.v3UserAllowed(other), true);
  equal(access.v3UserAllowed("user_clerk_id"), false);
  equal(access.v3TransportConfig().enabled, false);
}
for (const values of [{ UGC_V3_ENABLED: "0" }, { UGC_V3_ENABLED: "" }, { UGC_V3_ACCESS_MODE: "unknown" }, { UGC_V3_ACCESS_MODE: "owned " }]) {
  configure({ ...enabled, NODE_ENV: "production", UGC_V3_ACCESS_MODE: "owned", ...values });
  equal(access.v3UserAllowed(owner), false);
}
configure({ ...enabled, NODE_ENV: "production", UGC_V3_ACCESS_MODE: "owned" });
assert.throws(() => access.v3OpenAIConfig(), /V3_OPENAI_REFERENCE_PROVIDER_UNAVAILABLE/); checks++;
Object.assign(env, { UGC_V3_OPENAI_ENABLED: "1", OPENAI_API_KEY: "fixture-only", OPENAI_V3_IMAGE_MODEL: "fixture-image" });
assert.throws(() => access.v3OpenAIConfig(), /V3_OPENAI_DIRECTOR_PROVIDER_UNAVAILABLE/); checks++;
env.OPENAI_V3_DIRECTOR_MODEL = "fixture-director";
equal(access.v3OpenAIConfig().directorModel, "fixture-director");
equal(access.v3TransportConfig().enabled, false); // Storyboard never enables paid video.

const messages = typescriptLoader({
  "@/lib/accounting/generation-policy": { generationPolicyMessages: {} },
  "./package-status": { packageBuildError: value => value },
})("lib/final-video-generation-v3/reference-errors.ts");
equal(messages.v3ActionErrorMessage("V3_ACCESS_UNAVAILABLE"), "V3 generation is not available for this account in the current server access mode.");

// Execute the actual action function with boundary stubs. Ownership rejection
// stops before credit admission/enqueue, so no full workflow/provider fixture.
const file = "lib/final-video-generation-v3/runtime-server.ts";
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const action = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ownedV3Action" && node.body);
const schema = source.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations]).find(node => node.name.getText(source) === "actionSchema");
assert.ok(action && schema?.initializer); checks++;
const code = ts.transpileModule(`const actionSchema = ${schema.initializer.getText(source)};\n${action.getText(source)}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let authenticated = true, stores = 0, reads = 0;
const exports = {};
vm.runInNewContext(code, { exports, z, Error, AbortSignal, Date,
  ensureAppUser: async () => { if (!authenticated) throw new Error("AUTH_REQUIRED"); return { id: owner }; },
  assertV3Access: access.assertV3Access,
  V3Store: class {
    constructor() { stores++; }
    async read(acting, id) {
      reads++; equal(acting, owner); equal(id, project);
      throw new Error("FRESH_V3_PROJECT_REQUIRED");
    }
  },
});
const request = { action: "storyboard", projectId: project, ownerId: other };
configure({ ...enabled, NODE_ENV: "production", VERCEL_ENV: "preview", UGC_V3_ACCESS_MODE: "operator" });
await assert.rejects(() => exports.ownedV3Action(request), /V3_ACCESS_UNAVAILABLE/); checks++;
equal(stores, 0); equal(reads, 0);
env.UGC_V3_ACCESS_MODE = "owned";
await assert.rejects(() => exports.ownedV3Action(request), /FRESH_V3_PROJECT_REQUIRED/); checks++;
equal(reads, 1);
authenticated = false;
await assert.rejects(() => exports.ownedV3Action(request), /AUTH_REQUIRED/); checks++;
equal(stores, 1);
console.log(JSON.stringify({ checks, networkCalls: 0, paidRequests: 0, databaseWrites: 0 }));
