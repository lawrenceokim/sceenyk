// Focused regression of actual client policy and server action gates.
// No env files, database, provider requests or financial mutations.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { typescriptLoader } from "./lib/load-typescript.mjs";

const load = typescriptLoader();
const { generationUnavailability } = load("lib/accounting/generation-unavailability.ts");
const { assertFreeVideoSettings } = load("lib/accounting/generation-policy.ts");
const owner = "00000000-0000-4000-8000-000000000001";
const project = "00000000-0000-4000-8000-000000000002";
const held = { ready: true, settingsSupported: true, projectAllowed: false, videoAllowed: false,
  projectBlocker: "FREE_PROJECT_HISTORY_REVIEW_REQUIRED", preparationFunding: "credits", availableCredits: 147 };
assert.equal(generationUnavailability(held, "package").length, 0);
assert.equal(generationUnavailability(held, "storyboard").length, 0);
assert.equal(generationUnavailability(held, "video").length, 1);
assert.equal(generationUnavailability({ ...held, availableCredits: 0 }, "package").length, 0);
assert.equal(generationUnavailability({ ...held, availableCredits: 0 }, "storyboard").length, 1);
assert.equal(generationUnavailability({ ...held, settingsSupported: false }, "package").length, 1);
assert.equal(generationUnavailability({ ...held, ready: false }, "package").length, 1);

const file = "lib/final-video-generation-v3/runtime-server.ts";
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
const action = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "ownedV3Action" && n.body);
const schema = source.statements.filter(ts.isVariableStatement).flatMap(n => [...n.declarationList.declarations]).find(n => n.name.getText(source) === "actionSchema");
const code = ts.transpileModule(`const actionSchema = ${schema.initializer.getText(source)};\n${action.getText(source)}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
let access = held, allowedOwner = true, duration = "5", locked = false, accessReads = 0;
const exports = {};
vm.runInNewContext(code, { exports, z, Error, AbortSignal, Date,
  ensureAppUser: async () => ({ id: owner }), assertV3Access: () => {},
  V3Store: class { async read(acting, id) {
    assert.equal(acting, owner); assert.equal(id, project);
    if (!allowedOwner) throw new Error("FRESH_V3_PROJECT_REQUIRED");
    return { project: {}, runs: [], tasks: [], artifacts: [], packages: [], quotes: [] };
  } },
  projectBrief: async () => ({ duration, video_resolution: "480p" }), referenceOriginals: async () => ({}),
  lockedBriefSchema: z.never(), lockDocument: () => null, lockedOriginals: (_w, originals) => originals,
  creativeLockSummary: () => locked ? {} : null, creativeMutationActions: new Set(["build_package"]),
  projectVideoResolution: value => value, assertFreeVideoSettings,
  generationAccess: async () => { accessReads++; return access; },
  generationContext: () => ({ creationType: "ugc" }), requiresProDuration: () => false,
  approvedArtifacts: () => { throw new Error("PACKAGE_INPUT_VALIDATION_REACHED"); },
  readFrozenPackage: () => ({ id: "fixture-package" }), packageClips: () => null,
});
const request = action => exports.ownedV3Action({ action, projectId: project, ownerId: "forged" });
await assert.rejects(() => request("build_package"), /PACKAGE_INPUT_VALIDATION_REACHED/);
assert.equal(accessReads, 0); // No accounting RPC on local package admission.
for (const action of ["authorize", "authorize_clip"])
  await assert.rejects(() => request(action), /V3_REVIEW_SNAPSHOT_CHANGED/);
assert.equal(accessReads, 0); // Local consent never reserves generation funds.
for (const action of ["generate", "generate_clip"])
  await assert.rejects(() => request(action), /FREE_PROJECT_HISTORY_REVIEW_REQUIRED/);
access = { ...held, projectAllowed: true, paidBlocker: "INSUFFICIENT_CREDITS", availableCredits: 0 };
for (const action of ["generate", "generate_clip", "storyboard"])
  await assert.rejects(() => request(action), /INSUFFICIENT_CREDITS/);
await assert.rejects(() => request("build_package"), /PACKAGE_INPUT_VALIDATION_REACHED/);
locked = true;
await assert.rejects(() => request("build_package"), /V3_CREATIVE_INPUTS_LOCKED/);
locked = false; duration = "10";
await assert.rejects(() => request("build_package"), /GENERATION_LIMIT_5S_480P/);
duration = "5"; allowedOwner = false;
await assert.rejects(() => request("build_package"), /FRESH_V3_PROJECT_REQUIRED/);
console.log("PASS: package usage separation, video review/credit denial, preparation credits, settings, creative lock and ownership; zero network or database calls.");
