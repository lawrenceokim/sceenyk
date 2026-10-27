// Offline saved-work parser/validator checks. Synthetic scoped files only;
// network fails closed. No provider transport, env loading, DB or worker.
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve, dirname, basename } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { recoverStoryboardRequest, storyboardRecoveryInfo, savedStoryboardValidations } from "../lib/storyboard/recovery";
import { stageStoryboardResponse, stageStoryboardMetadata, stageStoryboardDiagnostic, readStoryboardRecovery } from "../lib/storyboard/spool";
import { inspectPreparedStoryboard, type StoryboardRow, type StoryboardInput, type Storyboard } from "../lib/storyboard/contract";

async function main() {
  let checks = 0; let networkCalls = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const ok = (v: unknown) => { assert.ok(v); checks++; };
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const detail = "Keep approved reference.";
  const asset = (n: number) => ({ id: id(n), storageKey: `synthetic/${n}`, etag: "synthetic", sha256: "a".repeat(64), sizeBytes: 100, mimeType: "image/png" });
  const input: StoryboardInput = { scene: { sceneDescription: "Show mug", character: { name: "Maya" }, product: { name: "Mug" }, settings: { duration: "10", aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" } }, dependencies: {}, character: asset(1), product: asset(2), location: asset(3), locationPlan: {}, wardrobe: null };
  const doc: Storyboard = { schemaVersion: 1, title: "Mug", concept: detail, durationMs: 10000, aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional",
    voice: { characterAssetId: id(1), description: detail, pace: "natural" }, continuity: { identity: detail, appearance: detail, outfit: detail, product: detail, location: detail },
    scenes: [{ number: 1, startMs: 0, endMs: 10000, purpose: detail, description: detail, characterAssetId: id(1), productAssetId: id(2), locationAssetId: id(3),
      actions: [{ startMs: 0, endMs: 3000, movement: detail, gesture: detail, expression: detail }], productInteraction: detail, productPosition: detail,
      camera: { angle: detail, shot: detail, framing: detail, movement: detail, zoom: "None", focus: detail }, lighting: { direction: detail, intensity: detail, colors: detail, atmosphere: detail },
      speech: [{ startMs: 300, endMs: 2300, speaker: "character", characterAssetId: id(1), text: "My mug", delivery: detail }], audio: { background: detail, effects: "None", music: "None" }, transition: detail, generationNotes: "", generationPrompt: "Derived from scene details." }] };
  const slot = { model: "synthetic-model", promptVersion: "ugc-storyboard-v1", contractVersion: 1, maxOutputTokens: 14000 };
  const row: StoryboardRow = { id: id(10), job_id: id(11), project_id: id(12), owner_user_id: id(13), revision: 4, version: 6, state: "failed", phase: "failed", input, document: null,
    model: "synthetic-model", requests: [], error_code: "STORYBOARD_OUTPUT_INVALID", approved_at: null, claim_token: null, lease_expires_at: null, heartbeat_at: null, attempts: 1,
    created_at: "2026-10-27T00:00:00Z", updated_at: "2026-10-27T00:00:00Z" };
  const folder = await mkdtemp(join(tmpdir(), "sceenyk-storyboard-validation-"));
  const oldDirectory = process.env.UGC_STORYBOARD_RECOVERY_DIR; const originalFetch = globalThis.fetch;
  process.env.UGC_STORYBOARD_RECOVERY_DIR = folder;
  globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN_IN_SAVED_WORK"); };
  try {
    const result = { output: JSON.stringify(doc), receipt: { status: "completed", responseId: "resp_synthetic", refused: false } };
    const durable = { ...row, requests: [{ ...slot, ...result }] };
    equal((await storyboardRecoveryInfo(durable)).validations?.[0].valid, true);
    equal(await recoverStoryboardRequest(durable, 0), result);
    const formatted = JSON.parse(result.output); formatted.scenes[0].endMs = "00:10.000";
    const normalizedRow = { ...row, requests: [{ ...slot, output: JSON.stringify({ output_parsed: formatted }), receipt: result.receipt }] };
    const info = await storyboardRecoveryInfo(normalizedRow);
    equal(info.validations?.[0].valid, true); ok(info.validations?.[0].normalizations.length);
    equal((await recoverStoryboardRequest(normalizedRow, 0))?.output, normalizedRow.requests[0].output);
    const invalid = structuredClone(doc); invalid.scenes[0].speech[0].text = "one two three four five six seven eight nine ten";
    const both = { ...row, requests: [{ ...slot, ...result }, { ...slot, output: JSON.stringify(invalid), receipt: result.receipt }] };
    const untouched = JSON.stringify(both);
    const reports = await savedStoryboardValidations(both);
    equal(reports.map(r => [r.requestIndex, r.valid]), [[1, false], [0, true]]);
    equal(reports[0].issues.map(i => i.code), ["SPEECH_WORD_BUDGET_EXCEEDED", "SPEECH_CHARACTER_BUDGET_EXCEEDED"]);
    equal(JSON.stringify(both), untouched);
    const missing = { ...row, id: id(20), requests: [slot] };
    await stageStoryboardMetadata(missing, 0, "created", { clientRequestId: id(21), model: "synthetic-model", stored: true, requestId: "req_saved", responseId: "resp_saved", providerStatus: "completed", httpStatus: 200 });
    equal((await storyboardRecoveryInfo(missing)).availability, "provider_retrievable");
    equal(await recoverStoryboardRequest(missing, 0), null);
    const local = { ...row, id: id(22), requests: [slot] };
    await stageStoryboardResponse(local, 0, result);
    const path = join(folder, `${local.owner_user_id}_${local.project_id}_${local.job_id}_${local.id}_0.json`);
    const hash = async () => createHash("sha256").update(await readFile(path)).digest("hex");
    const before = await hash();
    equal(await recoverStoryboardRequest(local, 0), result);
    equal((await storyboardRecoveryInfo(local)).validations?.[0].valid, true);
    equal(await hash(), before);
    await stageStoryboardDiagnostic(both, 1, { phase: "validation", category: "validation", httpStatus: 200, providerCode: null, requestId: "req_saved", responseId: "resp_saved", clientRequestId: null, providerStatus: "completed", validation: reports[0] });
    equal((await readStoryboardRecovery(both, 1)).diagnostic?.validation, reports[0]);
    const saved = inspectPreparedStoryboard((await recoverStoryboardRequest(durable, 0))?.output, input);
    equal(saved.document?.scenes[0].speech[0].text, doc.scenes[0].speech[0].text);
    ok(saved.document?.scenes[0].generationPrompt.includes(`asset:${input.location.id}`));
    const recoverySource = await readFile("lib/storyboard/recovery.ts", "utf8");
    ok(!/from ["']\.\/(?:provider|response-retrieval)["']/.test(recoverySource));
    const workerSource = await readFile("lib/storyboard/worker.ts", "utf8");
    const recoveryBranch = workerSource.slice(workerSource.indexOf("if (recovering) {"), workerSource.indexOf("// Re-read all persisted receipts"));
    ok(recoveryBranch.includes("row.requests.length - 1") && recoveryBranch.includes('checkpoint("ready"'));
    ok(!/requestStoryboard\(|storyboardConfig\(|retrieveStoryboardResponse\(|readReviewAsset\(/.test(recoveryBranch));
    equal(networkCalls, 0);
    console.info(JSON.stringify({ checks, providerCalls: 0, networkCalls, workers: 0, liveWrites: 0, rawResponsesPreserved: true }));
  } finally {
    globalThis.fetch = originalFetch;
    if (oldDirectory === undefined) delete process.env.UGC_STORYBOARD_RECOVERY_DIR; else process.env.UGC_STORYBOARD_RECOVERY_DIR = oldDirectory;
    const target = resolve(folder);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("sceenyk-storyboard-validation-")) throw new Error("INVALID_SYNTHETIC_CLEANUP_PATH");
    await rm(target, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Saved-work validation check failed"); process.exitCode = 1; });
