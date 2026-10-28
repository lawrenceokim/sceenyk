// Offline schema/contract checks only: no env loading, connected DB, workflow
// RPCs, persisted job fixtures, providers, workers, browser or private media.
import assert from "node:assert/strict";
import fs from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { zodTextFormat } from "openai/helpers/zod";
import { executableStoryboardSchema } from "../lib/storyboard/schema";
import { storyboardSchema, validateStoryboard, prepareStoryboard, inspectPreparedStoryboard, storyboardBinding, type Storyboard, type StoryboardInput } from "../lib/storyboard/contract";
import { StoryboardValidationError, validationReportSchema } from "../lib/storyboard/validation-diagnostics";
import { shouldPollUgcProgress } from "../lib/ugc-jobs/contract";

async function main() {
let checks = 0;
const ok = (value: unknown, message?: string) => { assert.ok(value, message); checks++; };
const equal = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const detail = "Preserve the approved reference.";
const asset = (n: number) => ({ id: id(n), storageKey: `synthetic/${n}.png`, etag: "synthetic", sha256: "a".repeat(64), sizeBytes: 100, mimeType: "image/png" });
const input: StoryboardInput = { scene: { projectTitle: "Demo", sceneDescription: "Show the mug", ugcType: "advertisement", narration: { mode: "prompt" },
  character: { name: "Maya" }, product: { name: "Mug" }, settings: { duration: "10", aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" } },
  dependencies: {}, character: asset(1), product: asset(2), location: asset(3), locationPlan: {}, wardrobe: null };
const doc: Storyboard = { schemaVersion: 1, title: "Morning mug", concept: "Maya presents a mug.", durationMs: 10_000,
  aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional", voice: { characterAssetId: id(1), description: "Warm original conversational voice", pace: "natural" },
  continuity: { identity: detail, appearance: detail, outfit: detail, product: detail, location: detail },
  scenes: [{ number: 1, startMs: 0, endMs: 10_000, purpose: "Introduce the mug", description: detail,
    characterAssetId: id(1), productAssetId: id(2), locationAssetId: id(3),
    actions: [{ startMs: 0, endMs: 3000, movement: "Lift the mug slowly", gesture: "Secure grip on the handle", expression: "Relaxed smile" }],
    productInteraction: "Hold the handle", productPosition: "At chest height",
    camera: { angle: "Eye level", shot: "Medium", framing: "Centered portrait", movement: "Static", zoom: "None", focus: "Mug and face" },
    lighting: { direction: "Camera left", intensity: "Soft", colors: "Neutral daylight", atmosphere: "Calm" },
    speech: [{ startMs: 3000, endMs: 9000, speaker: "character", characterAssetId: id(1), text: "Here is my morning mug.", delivery: "Natural" }],
    audio: { background: "Quiet room", effects: "None", music: "None" }, transition: "Clean ending", generationNotes: "",
    generationPrompt: `Maya lifts the mug. asset:${id(1)} asset:${id(2)} asset:${id(3)}. Realistic Professional portrait; static camera, soft daylight.` }] };

const binding = storyboardBinding(input);
equal(validateStoryboard(doc, binding), doc);
const compiled = prepareStoryboard(doc, input);
ok(compiled.scenes[0].generationPrompt.includes(doc.scenes[0].camera.focus));
const edited = structuredClone(doc); edited.scenes[0].camera.focus = "Rack focus to the approved mug"; edited.voice.description = "Gentle original voice";
const editedPrompt = prepareStoryboard(edited, input).scenes[0].generationPrompt;
ok(editedPrompt.includes(edited.scenes[0].camera.focus) && editedPrompt.includes(edited.voice.description));
equal(prepareStoryboard(compiled, input), compiled);
// Only equivalent representations/derived metadata change; no creative fields.
const formatVariant = JSON.parse(JSON.stringify(doc));
formatVariant.schemaVersion = "1"; delete formatVariant.durationMs;
formatVariant.aspectRatio = "9 / 16"; formatVariant.visualStyle = "realistic"; formatVariant.tone = " professional ";
formatVariant.voice.pace = "NATURAL"; delete formatVariant.scenes[0].number;
formatVariant.scenes[0].generationNotes = null; formatVariant.scenes[0].extra = "PRIVATE_UNSUPPORTED_CONTENT";
formatVariant.scenes[0].startMs = "00:00.000"; formatVariant.scenes[0].endMs = "00:00:10.000";
formatVariant.scenes[0].actions[0].startMs = "0 ms"; formatVariant.scenes[0].actions[0].endMs = "3s";
formatVariant.scenes[0].speech[0].startMs = "3000"; formatVariant.scenes[0].speech[0].endMs = "9.000s";
formatVariant.scenes[0].speech[0].speaker = "Character";
const normalized = inspectPreparedStoryboard({ output_parsed: formatVariant }, input);
equal(normalized.document, compiled); ok(normalized.report.normalizations.length >= 12);
ok(!JSON.stringify(normalized.report).includes("PRIVATE_"));
equal(formatVariant.scenes[0].extra, "PRIVATE_UNSUPPORTED_CONTENT");
equal(inspectPreparedStoryboard({ storyboard: doc }, input).document, compiled);
equal(inspectPreparedStoryboard({ object: "response", status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(doc) }] }] }, input).document, compiled);
const malformed = inspectPreparedStoryboard("{PRIVATE_MALFORMED", input);
equal(malformed.report.issues[0].code, "JSON_PARSE_FAILED"); ok(!JSON.stringify(malformed.report).includes("PRIVATE_"));
const incomplete = structuredClone(doc) as unknown as { scenes: Record<string, unknown>[] }; delete incomplete.scenes[0].camera;
const missingCamera = inspectPreparedStoryboard(incomplete, input);
ok(!missingCamera.document); equal(missingCamera.report.issues[0].fieldPath, "$.scenes[0].camera");
equal(missingCamera.report.issues[0].expectedType, "object");
const unsupportedVersion = inspectPreparedStoryboard({ ...doc, schemaVersion: 3 }, input);
equal(unsupportedVersion.report.issues[0].code, "SCHEMA_INVALID_VALUE");
equal(unsupportedVersion.report.issues[0].expected, "one of [1,2]");
ok(!inspectPreparedStoryboard({ ...doc, schemaVersion: 2 }, input).document); // No legacy execution fields under a v2 header.
const ambiguousTime = structuredClone(doc) as unknown as { scenes: Record<string, unknown>[] };
ambiguousTime.scenes[0].startMs = "0.5";
equal(inspectPreparedStoryboard(ambiguousTime, input).report.issues[0].fieldPath, "$.scenes[0].startMs");
const missingCreative = structuredClone(doc) as unknown as { scenes: Record<string, unknown>[] };
delete missingCreative.scenes[0].actions;
ok(!inspectPreparedStoryboard(missingCreative, input).document);
const wrongPace = structuredClone(doc); wrongPace.voice.pace = "fast" as never;
ok(!inspectPreparedStoryboard(wrongPace, input).document);
const wrongAsset = structuredClone(doc); wrongAsset.scenes[0].productAssetId = id(99);
equal(inspectPreparedStoryboard(wrongAsset, input).report.issues[0].code, "ASSET_BINDING_MISMATCH");
ok(!inspectPreparedStoryboard({ object: "response", status: "completed", output: [{ type: "message", content: [
  { type: "output_text", text: JSON.stringify(doc) }, { type: "output_text", text: JSON.stringify(doc) }] }] }, input).document);
const timing = structuredClone(doc); timing.scenes[0].speech = [
  { ...doc.scenes[0].speech[0], startMs: 300, endMs: 2300, text: "one two three four five six seven eight nine ten" },
  { ...doc.scenes[0].speech[0], startMs: 2600, endMs: 4700, text: "one two three four five six seven" },
];
const invalidTiming = inspectPreparedStoryboard(timing, input);
ok(!invalidTiming.document); equal(invalidTiming.report.issues.map(issue => issue.code), ["SPEECH_WORD_BUDGET_EXCEEDED", "SPEECH_CHARACTER_BUDGET_EXCEEDED", "SPEECH_WORD_BUDGET_EXCEEDED"]);
equal(invalidTiming.report.issues[0].received, 10); equal(invalidTiming.report.issues[0].expected, "<=4 words (2.3/second)");
ok(validationReportSchema.safeParse(invalidTiming.report).success);
assert.throws(() => prepareStoryboard(timing, input), StoryboardValidationError); checks++;
const invalidFormatted = { ...timing, schemaVersion: "1" };
const failedNormalized = inspectPreparedStoryboard(invalidFormatted, input);
ok(failedNormalized.report.normalizations.some(change => change.code === "SCHEMA_VERSION_NUMBER_NORMALIZED"));
equal(failedNormalized.report.issues.length, invalidTiming.report.issues.length);
for (const seconds of [5, 10, 30]) {
  const next = structuredClone(doc); next.durationMs = seconds * 1000; next.scenes[0].endMs = seconds * 1000; next.scenes[0].speech = [];
  equal(validateStoryboard(next, { ...binding, durationMs: seconds * 1000 }), next);
}
const negatives: Storyboard[] = [];
function invalid(change: (copy: Storyboard) => void) { const copy = structuredClone(doc); change(copy); negatives.push(copy);
  assert.throws(() => validateStoryboard(copy, binding)); checks++; }
invalid(d => { d.scenes[0].startMs = 1; });
invalid(d => { d.scenes[0].endMs = 9999; });
invalid(d => { d.scenes[0].endMs = 10_001; });
invalid(d => { d.scenes[0].number = 2; });
invalid(d => { d.scenes[0].productAssetId = id(9); });
invalid(d => { d.voice.characterAssetId = id(9); });
invalid(d => { d.scenes[0].generationPrompt = "Unbound prompt"; });
invalid(d => { d.scenes[0].actions[0].endMs = 500; });
invalid(d => { d.scenes[0].actions[0].startMs = -1; });
invalid(d => { d.scenes[0].speech[0].endMs = 10_001; });
invalid(d => { d.scenes[0].speech[0].characterAssetId = id(9); });
invalid(d => { d.scenes[0].speech[0].text = "many ".repeat(50); });
invalid(d => { d.scenes[0].speech.push(structuredClone(d.scenes[0].speech[0])); });
invalid(d => { d.scenes[0].camera.focus = ""; });
invalid(d => { d.scenes[0].startMs = 0.1; });
invalid(d => { d.durationMs = 15_000; });
invalid(d => { d.scenes.push(structuredClone(d.scenes[0])); });
invalid(d => { d.tone = "Funny"; });
ok(!storyboardSchema.safeParse({ ...doc, extra: true }).success);
const format = zodTextFormat(executableStoryboardSchema, "ugc_storyboard_v2");
ok(format.type === "json_schema" && format.strict);
const pollBase = { status: "queued" as const, paused: true };
for (const state of ["queued", "running", "deleting", "review", "approved", "failed", "deleted"] as const) {
  equal(shouldPollUgcProgress({ ...pollBase, storyboard: { state, error: null } as never }), ["queued", "running", "deleting"].includes(state));
}
equal(shouldPollUgcProgress({ ...pollBase, storyboard: { state: "deleting", error: "STORYBOARD_STORAGE_FAILED" } as never }), false);

const pg = new PGlite();
try {
  await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
  const target = "20261026006600_ugc_storyboards.sql";
  const files = fs.readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < target).sort();
  for (const file of files) await pg.exec(fs.readFileSync(`supabase/migrations/${file}`, "utf8"));
  const catalog = async () => (await pg.query<{ oid: number; prosrc: string }>("select oid,proname,prosrc,proacl,proconfig,prosecdef from pg_proc where pronamespace='public'::regnamespace order by oid")).rows
    .map(row => ({ ...row, prosrc: row.prosrc.replace(/\r\n?/g, "\n") }));
  const before = await catalog();
  const sql = fs.readFileSync(`supabase/migrations/${target}`, "utf8");
  await pg.exec(sql); const first = await catalog();
  await pg.exec(sql.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n"));
  equal(await catalog(), first);
  equal(first.filter(row => before.some(old => old.oid === row.oid)), before);
  for (const table of ["ugc_storyboards", "ugc_storyboard_events"]) {
    equal((await pg.query("select relrowsecurity enabled,has_table_privilege('service_role',oid,'SELECT') readable,has_table_privilege('service_role',oid,'UPDATE') writable,has_table_privilege('authenticated',oid,'SELECT') browser from pg_class where oid=$1::regclass", [`public.${table}`])).rows[0],
      { enabled: true, readable: true, writable: false, browser: false });
  }
  const funcs = (await pg.query<{ name: string; allowed: boolean; anonymous: boolean; browser: boolean; secured: boolean; config: string[] }>(
    "select proname name,has_function_privilege('service_role',oid,'EXECUTE') allowed,has_function_privilege('anon',oid,'EXECUTE') anonymous,has_function_privilege('authenticated',oid,'EXECUTE') browser,prosecdef secured,proconfig config from pg_proc where pronamespace='public'::regnamespace and proname like 'ugc_storyboard_%'"
  )).rows;
  equal(funcs.length, 7);
  for (const f of funcs) {
    equal(f.allowed, ["ugc_storyboard_input", "ugc_storyboard_action", "ugc_storyboard_claim", "ugc_storyboard_checkpoint"].includes(f.name));
    ok(!f.anonymous && !f.browser); ok(f.config.includes('search_path=""'));
  }
  equal((await pg.query("select (select count(*)::int from ugc_generation_jobs) jobs,(select count(*)::int from ugc_storyboards) storyboards")).rows[0], { jobs: 0, storyboards: 0 });
  const valid = async (value: unknown) => (await pg.query<{ valid: boolean }>("select ugc_storyboard_valid($1::jsonb,$2::jsonb) valid", [JSON.stringify(value), JSON.stringify(input)])).rows[0].valid;
  equal(await valid(doc), true);
  equal(await valid(normalized.document), true);
  equal(await valid(timing), false);
  // SQL defends timing/identity; complete strict structure is also validated by Zod.
  for (const value of negatives.filter((_, index) => index !== 13 && index !== 14)) equal(await valid(value), false);
  const worker = fs.readFileSync("lib/storyboard/worker.ts", "utf8");
  ok(worker.indexOf('checkpoint("intent"') < worker.indexOf("await requestStoryboard("));
  ok(worker.indexOf("await stageStoryboardResponse(") < worker.indexOf('checkpoint("response", { ...result'));
  ok(!/inngest|credit_ledger|generation_reservations/.test(worker));
  ok(sql.includes("Parent remains paused"));
  console.info(JSON.stringify({ checks, migrations: files.length + 1, rerunnable: true, upstreamFunctionsPreserved: before.length,
    workflowRPCs: 0, jobFixtures: 0, providerCalls: 0 }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Offline schema check failed"); process.exitCode = 1;
} finally { await pg.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Offline contract check failed"); process.exitCode = 1; });
