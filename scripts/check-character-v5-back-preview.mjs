// Real GET handler/readback/hash checks with in-memory auth, DB and R2 fixtures.
// No app server, browser, external service or persisted record is used.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { build } from "esbuild";
import sharp from "sharp";

let checks = 0;
const fixtureName = "__sceenykBackPreviewFixture";
const key = "11111111-1111-4111-8111-111111111111";
const candidateId = "22222222-2222-4222-8222-222222222222";
const oldId = "33333333-3333-4333-8333-333333333333";
const bytes = Buffer.from("exact saved Back fixture bytes");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const storageKey = `ugc/${key}/${key}/${key}/character-v5/${key}/candidates/${candidateId}.png`;
const artifact = { id: candidateId, storageKey, etag: "back-etag", sha256, sizeBytes: bytes.length, width: 960, height: 720, mimeType: "image/png" };
const proof = Object.fromEntries(Object.entries(artifact).filter(([name]) => !["storageKey", "etag"].includes(name)));
const candidate = { id: candidateId, workflow_id: key, slot: "back", state: "review", artifact, output_proof: proof, request_id: key,
  generation: null, input_asset: null };
const workflow = { id: key, job_id: key, owner_user_id: key, project_id: key, version: 7, slot: "back", state: "review", candidate_id: candidateId,
  accepted: { face: { ...artifact, id: oldId, storageKey: "private/face.png" }, back: { ...artifact, id: oldId, storageKey: "private/stale-back.png" } } };
const fixture = { candidate, workflow, reads: [], previewFailures: 0, body: bytes };
const context = () => ({ db, ownerId: key });
const db = {
  from(table) {
    const query = { select() { return query; }, eq() { return query; }, async single() {
      return { data: table === "ugc_character_v5_workflows" ? fixture.workflow : fixture.candidate, error: null };
    } }; return query;
  },
  async rpc() { fixture.previewFailures++; return { data: true, error: null }; },
};
const originalInfo = console.info; const originalError = console.error; const originalEnv = process.env.NODE_ENV;
try {
  globalThis[fixtureName] = { fixture, db, context };
  Object.assign(process.env, { NODE_ENV: "development" });
  console.info = () => {};
  console.error = () => {}; // Expected rejection fixtures; assertions still fail normally.
  const modules = {
    "server-only": "export {};",
    "next/navigation": "export function unstable_rethrow() {}",
    "@/lib/db/server": `export function createDatabaseClient() { return globalThis.${fixtureName}.db; }`,
    "@/lib/reference-review/server": `export class ReferenceReviewAccessError extends Error { constructor(status=403) { super(); this.status=status; } }
      export async function ownedReferenceReview() { return globalThis.${fixtureName}.context(); }`,
    "@/lib/reference-review/state": "export async function readReferenceReviewState() {}",
    "@/lib/storage/r2": `export async function readR2AnalysisMedia(key) {
      const f=globalThis.${fixtureName}.fixture; f.reads.push(key); return new Blob([f.body]).stream(); }
      export async function headR2CharacterObject() {} export async function putR2CharacterImage() {}
      export async function deleteR2CharacterCandidate() {}`,
    "./worker": "export async function existingV5SoulId() {}",
    "./recovery": "export async function recoverCharacterV5Candidate() {}",
  };
  const bundled = await build({ stdin: { contents: 'export { GET } from "./app/api/ugc/character-v5/route";',
    resolveDir: process.cwd(), loader: "ts" }, platform: "node", format: "cjs", bundle: true, write: false, packages: "external",
    tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
    plugins: [{ name: "local-preview-fixtures", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (Object.hasOwn(modules, args.path) && (!args.path.startsWith("./") || /character-v5[/\\]server\.ts$/.test(args.importer))) {
          return { path: args.path, namespace: "preview-fixture" };
        }
        // Resolve repository files directly so this fixture never scans parent
        // directories for package/tsconfig files outside the sandbox.
        if (args.path.startsWith(".") || args.path.startsWith("@/")) {
          const base = args.path.startsWith("@/") ? path.resolve(process.cwd(), args.path.slice(2)) : path.resolve(args.resolveDir, args.path);
          const file = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`].find(value => existsSync(value));
          if (!file) throw new Error(`Missing fixture dependency: ${args.path}`);
          return { path: file, namespace: "preview-project" };
        }
        return { path: args.path, external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "preview-fixture" }, args => ({ contents: modules[args.path], loader: "js" }));
      builder.onLoad({ filter: /.*/, namespace: "preview-project" }, args => ({ contents: readFileSync(args.path, "utf8"), loader: "ts", resolveDir: path.dirname(args.path) }));
    } }] });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", bundled.outputFiles[0].text)(createRequire(import.meta.url), compiled, compiled.exports);
  const get = (id = candidateId, slot = "back", extra = "") => compiled.exports.GET(new Request(`https://app.example.invalid/api/ugc/character-v5?projectId=${key}&jobId=${key}&version=7&slot=${slot}${id ? `&candidateId=${id}` : ""}${extra}`));
  // Card and lightbox request exactly the same candidate endpoint.
  for (const surface of ["card", "lightbox"]) {
    const response = await get();
    assert.equal(response.status, 200, surface); checks++;
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes); checks++;
    assert.equal(response.headers.get("X-Sceenyk-Back-Object-Key"), storageKey); checks++;
    assert.equal(response.headers.get("X-Sceenyk-Back-SHA256"), sha256); checks++;
    assert.equal(response.headers.get("X-Sceenyk-Back-Candidate"), candidateId); checks++;
    assert.equal(response.headers.get("X-Sceenyk-Back-Request-Id"), key); checks++;
    assert.equal(response.headers.get("X-Sceenyk-Back-Fallback"), "false"); checks++;
    assert(response.headers.get("Cache-Control").includes("no-store")); checks++;
  }
  assert(fixture.reads.every(value => value === storageKey)); checks++;
  for (const invalid of [null, { ...candidate, slot: "face" }, { ...candidate, artifact: { ...artifact, storageKey: "private/original.png" } },
    { ...candidate, artifact: { ...artifact, storageKey: workflow.accepted.face.storageKey } },
    { ...candidate, artifact: { ...artifact, sha256: "b".repeat(64) } }]) {
    fixture.candidate = invalid;
    const reads = fixture.reads.length;
    assert.notEqual((await get()).status, 200); checks++;
    assert.equal(fixture.reads.length, reads, "invalid candidate never reads a fallback"); checks++;
  }
  fixture.candidate = candidate;
  assert.equal((await get(oldId)).status, 404); checks++;
  fixture.body = Buffer.from("different bytes of same length");
  assert.notEqual((await get()).status, 200); checks++;
  assert.equal(fixture.previewFailures, 1); checks++;
  fixture.body = bytes;
  Object.assign(process.env, { NODE_ENV: "production" });
  const production = await get();
  assert.equal(production.status, 200); assert.equal(production.headers.get("X-Sceenyk-Back-Object-Key"), null); checks++;
  // Historical masked Front-source previews retain concealment in production, for both candidate
  // and accepted-image routes; the private full provider source is never served.
  const frontBytes = await sharp({ create: { width: 256, height: 512, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const frontArtifact = { ...artifact, width: 256, height: 512, sizeBytes: frontBytes.length, sha256: createHash("sha256").update(frontBytes).digest("hex") };
  fixture.body = frontBytes;
  fixture.candidate = { ...candidate, slot: "front_source", artifact: frontArtifact,
    output_proof: Object.fromEntries(Object.entries(frontArtifact).filter(([name]) => !["storageKey", "etag"].includes(name))),
    generation: { concealment: "gray-mask-v1" } };
  fixture.workflow = { ...workflow, slot: "front_source", crop_top: 2500 };
  for (const surface of ["card", "lightbox"]) {
    const response = await get(candidateId, "front_source");
    assert.equal(response.status, 200, surface); checks++;
    const rendered = Buffer.from(await response.arrayBuffer());
    assert.notDeepEqual(rendered, frontBytes); checks++;
    const decoded = await sharp(rendered).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    assert.equal(decoded.info.width, 256); assert.equal(decoded.info.height, 512); checks++;
    assert(decoded.data.subarray(0, 256 * 128 * 3).every(value => value === 184)); checks++;
    assert.deepEqual([...decoded.data.subarray(256 * 128 * 3, 256 * 128 * 3 + 3)], [255, 0, 0]); checks++;
  }
  assert.equal((await get(candidateId, "front_source", "&maskTop=3000")).status, 404); checks++;
  assert.equal((await get(candidateId, "back", "&maskTop=3000")).status, 404); checks++;
  fixture.candidate = { ...fixture.candidate, state: "accepted" };
  fixture.workflow = { ...fixture.workflow, slot: "front", candidate_id: oldId, accepted: { ...workflow.accepted, front_source: frontArtifact } };
  assert.equal((await get("", "front_source")).status, 200); checks++;
  // Legacy Front sources retain their old preview behavior, and a query cannot
  // impersonate a new concealed generation.
  fixture.candidate = { ...fixture.candidate, state: "review", generation: null };
  fixture.workflow = { ...workflow, slot: "front_source", crop_top: 2500 };
  const legacy = await get(candidateId, "front_source");
  assert.deepEqual(Buffer.from(await legacy.arrayBuffer()), frontBytes); checks++;
  assert.equal((await get(candidateId, "front_source", "&maskTop=3000")).status, 404); checks++;
  fixture.candidate = { ...fixture.candidate, generation: { frontPreparation: "provider-final-v1" } };
  for (const surface of ["card", "lightbox"]) {
    const final = await get(candidateId, "front_source");
    assert.equal(final.status, 200, surface); checks++;
    assert.deepEqual(Buffer.from(await final.arrayBuffer()), frontBytes, "final source is displayed exactly as stored, with no crop/mask"); checks++;
  }
  const savedFront = fixture.candidate;
  for (const invalid of [{ ...savedFront, artifact: { ...frontArtifact, storageKey: workflow.accepted.face.storageKey } },
    { ...savedFront, output_proof: { ...savedFront.output_proof, height: 128 } }]) {
    fixture.candidate = invalid;
    const reads = fixture.reads.length;
    assert.notEqual((await get(candidateId, "front_source")).status, 200); checks++;
    assert.equal(fixture.reads.length, reads, "invalid Front proof/key never falls back or reads another image"); checks++;
  }
} finally {
  console.info = originalInfo;
  console.error = originalError;
  if (originalEnv === undefined) delete process.env.NODE_ENV; else Object.assign(process.env, { NODE_ENV: originalEnv });
  delete globalThis[fixtureName];
}
console.info(JSON.stringify({ checks, providerCalls: 0, databaseCalls: 0, storageCalls: 0, fixturesOnly: true }));
