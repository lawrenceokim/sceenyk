// Synthetic pure timing/manual-edit checks and isolated schema/ACL validation.
// No env loading, current records/files, provider/worker imports or workflow RPCs.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { finalizeStoryboard, inspectPreparedStoryboard, type Storyboard, type StoryboardInput, type StoryboardRow } from "../lib/storyboard/contract";
import { manualStoryboardCandidates, prepareManualStoryboard, StoryboardManualRecoveryError } from "../lib/storyboard/manual-recovery";
import { preferredSpeechTarget, speechIntervalBudget, storyboardSpeechPlan } from "../lib/storyboard/speech-budget";
import { storyboardCorrection } from "../lib/storyboard/correction";
import { StoryboardValidationError } from "../lib/storyboard/validation-diagnostics";
let checks = 0; let networkCalls = 0;
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (v: unknown) => { assert.ok(v); checks++; };
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const asset = (n: number) => ({ id: id(n), storageKey: `synthetic/${n}`, etag: "synthetic", sha256: "a".repeat(64), sizeBytes: 100, mimeType: "image/png" });
const input: StoryboardInput = { scene: { sceneDescription: "Show mug", character: { name: "Maya" }, product: { name: "Mug" }, settings: { duration: "10", aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" } }, dependencies: {}, character: asset(1), product: asset(2), location: asset(3), locationPlan: {}, wardrobe: null };
const detail = "Keep approved reference.";
const doc: Storyboard = { schemaVersion: 1, title: "Mug", concept: detail, durationMs: 10000, aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional", voice: { characterAssetId: id(1), description: detail, pace: "natural" }, continuity: { identity: detail, appearance: detail, outfit: detail, product: detail, location: detail },
  scenes: [0, 1].map(i => ({ number: i + 1, startMs: i * 5000, endMs: (i + 1) * 5000, purpose: detail, description: detail, characterAssetId: id(1), productAssetId: id(2), locationAssetId: id(3),
    actions: [{ startMs: i * 5000, endMs: i * 5000 + 1200, movement: detail, gesture: detail, expression: detail }], productInteraction: detail, productPosition: detail,
    camera: { angle: detail, shot: detail, framing: detail, movement: "Static", zoom: "None", focus: detail }, lighting: { direction: detail, intensity: detail, colors: detail, atmosphere: detail },
    speech: [{ startMs: i * 5000 + 1400, endMs: i * 5000 + (i === 0 ? 2400 : 3400), speaker: "character", characterAssetId: id(1), text: i === 0 ? "Look at this mug" : "Mug.", delivery: detail }],
    audio: { background: detail, effects: "None", music: "None" }, transition: detail, generationNotes: "", generationPrompt: `asset:${id(1)} asset:${id(2)} asset:${id(3)}` })) };
const first = structuredClone(doc); first.scenes[0].speech[0].endMs = 2900; first.scenes[1].actions[0].endMs = 5600;
const slot = { model: "synthetic-model", promptVersion: "ugc-storyboard-v1", contractVersion: 1, maxOutputTokens: 14000, receipt: { status: "completed", refused: false } };
const row: StoryboardRow = { id: id(10), job_id: id(11), project_id: id(12), owner_user_id: id(13), revision: 1, version: 6, state: "failed", phase: "failed", input, document: null,
  model: "synthetic-model", requests: [{ ...slot, output: JSON.stringify(first) }, { ...slot, output: JSON.stringify(doc) }], attempts: 1, error_code: "STORYBOARD_OUTPUT_INVALID", approved_at: null, claim_token: null, lease_expires_at: null, heartbeat_at: null,
  created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z" };
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
async function main() {
  for (let hard = 0; hard <= 100; hard++) {
    const target = preferredSpeechTarget(hard); ok(target <= hard && target >= 0);
    if (hard >= 3) equal(target, Math.floor(hard * 0.75));
  }
  equal([2, 3, 4].map(preferredSpeechTarget), [1, 2, 3]);
  for (const duration of [5000, 10000, 30000]) {
    const plan = storyboardSpeechPlan(duration); equal(plan.minimumActionMs, 700); equal(plan.preferredActionMs, 900);
    for (const scene of plan.scenes) { ok(scene.actionAndCamera.durationMs >= 900); ok(scene.maximumRecommendedActions * 900 <= scene.actionAndCamera.durationMs); }
    for (const pace of ["slow", "natural", "energetic"] as const) { ok(plan.limitsByPace[pace].preferredTargetWords <= plan.limitsByPace[pace].maximumSpokenWords); }
  }
  const untouched = JSON.stringify(row);
  const report2 = inspectPreparedStoryboard(doc, input).report; equal(report2.issues.map(i => [i.code, i.received, i.expected]), [["SPEECH_WORD_BUDGET_EXCEEDED", 4, "<=2 words (2.3/second)"]]);
  const report1 = inspectPreparedStoryboard(first, input).report;
  equal(report1.issues.map(i => i.code), ["SPEECH_WORD_BUDGET_EXCEEDED", "ACTION_TOO_SHORT"]);
  const correction = storyboardCorrection(JSON.stringify(first), input, new StoryboardValidationError(report1));
  equal(correction.mode, "timing_only"); ok("actionTimingFailures" in correction);
  if (!("actionTimingFailures" in correction)) throw new Error("MISSING_ACTION_FEEDBACK");
  equal(correction.timingFailures.map(i => [i.sceneNumber, i.lineNumber, i.currentWordCount, i.maximumWords, i.preferredTargetWords]), [[1, 1, 4, 3, 2]]);
  equal(correction.actionTimingFailures.map(i => [i.sceneNumber, i.actionNumber, i.currentActionDurationMs, i.minimumActionMs, i.preferredActionMs]), [[2, 1, 600, 700, 900]]);
  ok(correction.instruction.includes("Shorten only affected") && correction.instruction.includes("Do NOT shorten physical actions"));
  const correction2 = storyboardCorrection(JSON.stringify(doc), input, new StoryboardValidationError(report2));
  ok("timingFailures" in correction2);
  if (!("timingFailures" in correction2)) throw new Error("MISSING_SPEECH_FEEDBACK");
  equal(correction2.timingFailures.map(i => [i.currentWordCount, i.maximumWords, i.preferredTargetWords]), [[4, 2, 1]]);
  const candidates = manualStoryboardCandidates(row); equal(candidates.map(c => c.requestIndex), [1]);
  const repaired = structuredClone(candidates[0].document); repaired.scenes[0].speech[0].text = "Mug.";
  const ready = prepareManualStoryboard(row, 1, repaired); equal(ready.scenes[0].speech[0].text, "Mug."); equal(inspectPreparedStoryboard(ready, input).report.valid, true);
  equal(JSON.stringify(row), untouched); equal(row.requests.length, 2); equal(row.attempts, 1); equal(row.state, "failed");
  assert.throws(() => prepareManualStoryboard(row, 1, doc), StoryboardValidationError); checks++;
  assert.throws(() => prepareManualStoryboard(row, 0, repaired), StoryboardManualRecoveryError); checks++;
  for (const change of [(d: Storyboard) => { d.voice.pace = "energetic"; }, (d: Storyboard) => { d.scenes[0].speech[0].endMs += 1000; },
    (d: Storyboard) => { d.scenes[0].camera.movement = "Pan"; }, (d: Storyboard) => { d.scenes[0].productAssetId = id(99); },
    (d: Storyboard) => { d.scenes[0].speech = []; }, (d: Storyboard) => { d.scenes[0].actions[0].endMs = 600; }]) {
    const changed = structuredClone(repaired); change(changed); assert.throws(() => prepareManualStoryboard(row, 1, changed), StoryboardManualRecoveryError); checks++;
  }
  const promptTamper = structuredClone(repaired); promptTamper.scenes[0].generationPrompt = "UNTRUSTED_PROMPT";
  ok(!prepareManualStoryboard(row, 1, promptTamper).scenes[0].generationPrompt.includes("UNTRUSTED_PROMPT"));
  equal(manualStoryboardCandidates({ ...row, state: "approved" }).length, 0);
  equal(manualStoryboardCandidates({ ...row, requests: [{ ...slot, output: "{invalid" }] }).length, 0);
  equal(manualStoryboardCandidates({ ...row, requests: [{ ...slot, output: JSON.stringify(doc), receipt: { status: "incomplete" } }] }).length, 0);
  const noWordsPossible = structuredClone(doc); noWordsPossible.scenes[0].speech[0].endMs = 1500;
  equal(manualStoryboardCandidates({ ...row, requests: [{ ...slot, output: JSON.stringify(noWordsPossible) }] }).length, 0);
  const invalidAction = structuredClone(ready); invalidAction.scenes[1].actions[0].endMs = 5600;
  assert.throws(() => finalizeStoryboard(invalidAction, input), StoryboardValidationError); checks++;
  const overlap = structuredClone(ready); overlap.scenes[1].startMs = 4999;
  assert.throws(() => finalizeStoryboard(overlap, input), StoryboardValidationError); checks++;
  equal(finalizeStoryboard(ready, input), ready); equal(speechIntervalBudget(1400, 2400, "natural").preferredTargetWords, 1);
  const pg = new PGlite();
  try {
    await pg.exec("create role anon;create role authenticated;create role service_role bypassrls;");
    const target = "20261027006700_ugc_storyboard_manual_dialogue_recovery.sql";
    const files = readdirSync("supabase/migrations").filter(file => file.endsWith(".sql") && file < target).sort();
    for (const file of files) await pg.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    const catalog = async () => (await pg.query<{ oid: number; prosrc: string }>("select oid,proname,prosrc,proacl,proconfig,prosecdef from pg_proc where pronamespace='public'::regnamespace order by oid")).rows.map(r => ({ ...r, prosrc: r.prosrc.replace(/\r\n?/g, "\n") }));
    const before = await catalog(); const sql = readFileSync(`supabase/migrations/${target}`, "utf8");
    await pg.exec(sql); const after = await catalog(); await pg.exec(sql.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n")); equal(await catalog(), after);
    equal(after.filter(r => before.some(old => old.oid === r.oid)), before);
    equal((await pg.query("select prosecdef secured,proconfig config,has_function_privilege('service_role',oid,'EXECUTE') service,has_function_privilege('authenticated',oid,'EXECUTE') browser,has_function_privilege('anon',oid,'EXECUTE') anonymous from pg_proc where proname='ugc_storyboard_recover_dialogue'")).rows[0],
      { secured: true, config: ['search_path=""'], service: true, browser: false, anonymous: false });
    equal((await pg.query("select has_table_privilege('service_role','ugc_storyboards','UPDATE') direct_write,(select count(*)::int from ugc_storyboards) rows")).rows[0], { direct_write: false, rows: 0 });
    equal((await pg.query<{ valid: boolean }>("select ugc_storyboard_valid($1::jsonb,$2::jsonb) valid", [JSON.stringify(ready), JSON.stringify(input)])).rows[0].valid, true);
    equal((await pg.query<{ valid: boolean }>("select ugc_storyboard_valid($1::jsonb,$2::jsonb) valid", [JSON.stringify(first), JSON.stringify(input)])).rows[0].valid, false);
    ok(sql.includes("p_owner") && sql.includes("b.version is distinct from p_version") && sql.includes("public.ugc_storyboard_input(p_job) is distinct from b.input"));
    ok(!/set\s+requests\s*=|set\s+attempts\s*=|update public\.ugc_generation_jobs|insert into public\.ugc_generation_jobs/i.test(sql));
    const manualSource = readFileSync("lib/storyboard/manual-recovery.ts", "utf8");
    ok(!/from ["']\.\/(?:provider|response-retrieval|worker|spool)["']/.test(manualSource));
    const server = readFileSync("lib/storyboard/server.ts", "utf8");
    ok(server.includes("prepareManualStoryboard(read.data") && server.includes('rpc("ugc_storyboard_recover_dialogue"'));
    const worker = readFileSync("lib/storyboard/worker.ts", "utf8");
    ok(worker.indexOf("const doc = finalizeStoryboard(") < worker.indexOf('await checkpoint("ready", { document: doc })'));
    equal(networkCalls, 0);
    console.info(JSON.stringify({ checks, migrations: files.length + 1, existingFunctionsPreserved: before.length, providerCalls: 0, workers: 0, workflowRPCs: 0, liveWrites: 0, jobFixtures: 0 }));
  } finally { await pg.close(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Offline timing recovery check failed"); process.exitCode = 1; }).finally(() => { globalThis.fetch = originalFetch; });
