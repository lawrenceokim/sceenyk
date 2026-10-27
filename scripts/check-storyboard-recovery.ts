// Offline protocol/contract checks only. All SDK HTTP is mocked; synthetic
// recovery files are isolated in a new task temp directory. No env loading,
// live database/provider, worker, job retry or real asset access.
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname, basename } from "node:path";
import OpenAI from "openai";
import { requestStoryboard } from "../lib/storyboard/provider";
import { retrieveStoryboardResponse } from "../lib/storyboard/response-retrieval";
import { readStoryboardResponse, readStoryboardRecovery, stageStoryboardResponse, stageStoryboardRawResponse, stageStoryboardMetadata, stageStoryboardDiagnostic } from "../lib/storyboard/spool";
import { recoverStoryboardRequest, storyboardRecoveryInfo } from "../lib/storyboard/recovery";
import { storyboardProviderDiagnostic, StoryboardProviderFailure } from "../lib/storyboard/diagnostics";
import { canCreateStoryboardRequest, canValidateStoryboardResponse, recoveryOnly, type StoryboardProviderMeta } from "../lib/storyboard/recovery-contract";
import { prepareStoryboard, type StoryboardRow, type StoryboardInput, type Storyboard } from "../lib/storyboard/contract";

async function main() {
  let checks = 0;
  const equal = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
  const ok = (value: unknown) => { assert.ok(value); checks++; };
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const asset = (n: number) => ({ id: id(n), storageKey: `synthetic/${n}.png`, etag: "synthetic", sha256: "a".repeat(64), sizeBytes: 100, mimeType: "image/png" });
  const input: StoryboardInput = { scene: { sceneDescription: "Show a mug", character: { name: "Maya" }, product: { name: "Mug" },
    settings: { duration: "10", aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional" } },
    dependencies: {}, character: asset(1), product: asset(2), location: asset(3), locationPlan: {}, wardrobe: null };
  const detail = "Preserve approved appearance.";
  const doc: Storyboard = { schemaVersion: 1, title: "Mug", concept: detail, durationMs: 10000, aspectRatio: "9:16", visualStyle: "Realistic", tone: "Professional",
    voice: { characterAssetId: id(1), description: "Original calm voice", pace: "natural" },
    continuity: { identity: detail, appearance: detail, outfit: detail, product: detail, location: detail }, scenes: [{ number: 1, startMs: 0, endMs: 10000,
      purpose: detail, description: detail, characterAssetId: id(1), productAssetId: id(2), locationAssetId: id(3),
      actions: [{ startMs: 0, endMs: 3000, movement: "Lift mug", gesture: "Firm handle grip", expression: "Gentle smile" }], productInteraction: detail, productPosition: detail,
      camera: { angle: detail, shot: detail, framing: detail, movement: "Static", zoom: "None", focus: detail },
      lighting: { direction: detail, intensity: detail, colors: detail, atmosphere: detail }, speech: [], audio: { background: detail, effects: "None", music: "None" },
      transition: "End", generationNotes: "", generationPrompt: `asset:${id(1)} asset:${id(2)} asset:${id(3)}` }] };
  const row: StoryboardRow = { id: id(10), job_id: id(11), project_id: id(12), owner_user_id: id(13), revision: 1, version: 1,
    state: "running", phase: "generating", input, document: null, model: "gpt-5.4-mini", requests: [{ model: "gpt-5.4-mini", promptVersion: "ugc-storyboard-v1", contractVersion: 1, maxOutputTokens: 14000 }],
    error_code: null, approved_at: null, claim_token: id(14), lease_expires_at: null, heartbeat_at: null, attempts: 1,
    created_at: "2026-10-26T00:00:00Z", updated_at: "2026-10-26T00:00:00Z" };
  const meta: StoryboardProviderMeta = { clientRequestId: id(20), model: "gpt-5.4-mini", stored: false, requestId: null, responseId: null, providerStatus: "unknown", httpStatus: null };
  const folder = await mkdtemp(join(tmpdir(), "sceenyk-storyboard-test-"));
  const names = ["OPENAI_API_KEY", "OPENAI_STORYBOARD_MODEL", "UGC_STORYBOARD_ENABLED", "UGC_STORYBOARD_RECOVERY_DIR", "UGC_STORYBOARD_STORE_RESPONSES"];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]])); const originalFetch = globalThis.fetch;
  const signal = AbortSignal.timeout(20_000);
  try {
    Object.assign(process.env, { OPENAI_API_KEY: "synthetic-key", OPENAI_STORYBOARD_MODEL: "gpt-5.4-mini", UGC_STORYBOARD_ENABLED: "1", UGC_STORYBOARD_RECOVERY_DIR: folder, UGC_STORYBOARD_STORE_RESPONSES: "0" });
    for (const attempts of [1, 2, 3]) {
      equal(recoveryOnly(attempts), attempts > 1);
      equal(canCreateStoryboardRequest(attempts, recoveryOnly(attempts), false), attempts === 1);
      equal(canCreateStoryboardRequest(attempts, true, false), false);
      equal(canCreateStoryboardRequest(attempts, false, true), false);
    }
    equal(canValidateStoryboardResponse({ status: "completed", refused: false }), true);
    for (const status of ["in_progress", "failed", "incomplete", "cancelled", undefined]) equal(canValidateStoryboardResponse({ status }), false);
    equal(canValidateStoryboardResponse({ status: "completed", refused: true }), false);
    const terminal = (output: string, status = "completed") => ({ id: "resp_synthetic", object: "response", model: "gpt-5.4-mini", status,
      output: [{ id: "msg_synthetic", type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: output, annotations: [] }] }], usage: null });
    let calls = 0; let creates = 0; const events: string[] = [];
    globalThis.fetch = async (_url, init) => {
      calls++; creates++; equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body)); equal(body.stream, true); equal(body.store, false); equal(body.max_output_tokens, 14000);
      equal(new Headers(init?.headers).get("x-client-request-id"), meta.clientRequestId);
      const payload = [{ type: "response.created", response: { id: "resp_synthetic", status: "in_progress" } },
        { type: "response.completed", response: terminal(JSON.stringify(doc)) }];
      return new Response(payload.map(value => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`).join(""),
        { status: 200, headers: { "Content-Type": "text/event-stream", "x-request-id": "req_synthetic" } });
    };
    await stageStoryboardMetadata(row, 0, "intent", meta);
    const result = await requestStoryboard(input, "gpt-5.4-mini", [Buffer.from("synthetic")], signal, { metadata: meta,
      saveMetadata: async (kind, value) => { events.push(kind); await stageStoryboardMetadata(row, 0, kind, value); },
      saveRawResponse: async value => { events.push("raw_response"); await stageStoryboardRawResponse(row, 0, value); },
      saveResponse: async value => { events.push("durable_response"); await stageStoryboardResponse(row, 0, value); },
    });
    equal(events, ["headers", "created", "raw_response", "durable_response"]); equal(creates, 1); equal(calls, 1);
    equal(result.receipt.responseId, "resp_synthetic"); equal(result.receipt.requestId, "req_synthetic");
    equal(await readStoryboardResponse(row, 0), result);
    equal((await readStoryboardRecovery(row, 0)).metadata?.responseId, "resp_synthetic");
    equal((await storyboardRecoveryInfo(row)).availability, "saved_response");
    equal(prepareStoryboard(JSON.parse(result.output), input).durationMs, 10000);
    await assert.rejects(stageStoryboardResponse(row, 0, { ...result, output: "different" })); checks++;
    equal(await readStoryboardResponse(row, 0), result);
    globalThis.fetch = async () => { throw new Error("NO_NETWORK_DURING_LOCAL_RECOVERY"); };
    equal(await recoverStoryboardRequest({ ...row, attempts: 2 }, 0), result);
    const missing = { ...row, id: id(30) };
    equal((await storyboardRecoveryInfo(missing)).availability, "unavailable");
    equal(await recoverStoryboardRequest(missing, 0), null);
    equal(await retrieveStoryboardResponse({ ...meta, responseId: "resp_synthetic" }, signal), null);
    equal(await retrieveStoryboardResponse({ ...meta, stored: true }, signal), null);

    let gets = 0;
    globalThis.fetch = async (_url, init) => { gets++; equal(init?.method, "GET"); return Response.json(terminal(JSON.stringify(doc)), { headers: { "x-request-id": "req_retrieval" } }); };
    const retrievable = { ...row, id: id(31) };
    await stageStoryboardMetadata(retrievable, 0, "created", { ...meta, stored: true, responseId: "resp_synthetic", requestId: "req_original", providerStatus: "in_progress" });
    equal((await storyboardRecoveryInfo(retrievable)).availability, "provider_retrievable");
    equal(await recoverStoryboardRequest(retrievable, 0), null); equal(gets, 0);
    const retrieved = await retrieveStoryboardResponse({ ...meta, stored: true, responseId: "resp_synthetic", requestId: "req_original" }, signal);
    if (retrieved) await stageStoryboardResponse(retrievable, 0, retrieved);
    equal(gets, 1); equal(retrieved?.receipt.requestId, "req_original");
    equal((await storyboardRecoveryInfo(retrievable)).availability, "saved_response");
    await recoverStoryboardRequest(retrievable, 0); equal(gets, 1);

    const timeout = storyboardProviderDiagnostic(new OpenAI.APIConnectionTimeoutError(), "headers", meta);
    equal(timeout.category, "timeout"); equal(timeout.clientRequestId, meta.clientRequestId);
    await stageStoryboardDiagnostic(missing, 0, timeout);
    equal((await readStoryboardRecovery(missing, 0)).diagnostic, timeout);
    let errors = 0;
    globalThis.fetch = async () => { errors++; return Response.json({ error: { code: "invalid_api_key", message: "PRIVATE_MESSAGE_DO_NOT_PERSIST", param: "PRIVATE_PARAM" } },
      { status: 401, headers: { "x-request-id": "req_rejected" } }); };
    let failure: unknown;
    try { await requestStoryboard(input, "gpt-5.4-mini", [], signal, { metadata: meta, saveMetadata: async () => {}, saveRawResponse: async () => {}, saveResponse: async () => {} }); }
    catch (error) { failure = error; }
    ok(failure instanceof StoryboardProviderFailure);
    equal((failure as StoryboardProviderFailure).diagnostic.category, "authentication"); equal((failure as StoryboardProviderFailure).diagnostic.requestId, "req_rejected");
    equal(errors, 1); ok(!JSON.stringify(failure).includes("PRIVATE_"));

    const malformed = { ...row, id: id(32) };
    globalThis.fetch = async () => new Response([
      { type: "response.created", response: { id: "resp_synthetic", status: "in_progress" } },
      { type: "response.completed", response: terminal("{invalid JSON") },
    ].map(value => `event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`).join(""), { headers: { "Content-Type": "text/event-stream", "x-request-id": "req_invalid_output" } });
    const invalid = await requestStoryboard(input, "gpt-5.4-mini", [], signal, { metadata: meta,
      saveMetadata: async (kind, value) => stageStoryboardMetadata(malformed, 0, kind, value),
      saveRawResponse: async value => stageStoryboardRawResponse(malformed, 0, value),
      saveResponse: async value => stageStoryboardResponse(malformed, 0, value) });
    equal((await readStoryboardResponse(malformed, 0))?.output, "{invalid JSON");
    assert.throws(() => JSON.parse(invalid.output)); checks++;
    equal((await storyboardRecoveryInfo(malformed)).availability, "saved_response");

    const interrupted = { ...row, id: id(33) };
    globalThis.fetch = async () => new Response(`event: response.created\ndata: ${JSON.stringify({ type: "response.created", response: { id: "resp_interrupted", status: "in_progress" } })}\n\n`,
      { headers: { "Content-Type": "text/event-stream", "x-request-id": "req_interrupted" } });
    let interruptedFailure: unknown;
    try { await requestStoryboard(input, "gpt-5.4-mini", [], signal, { metadata: { ...meta, stored: true },
      saveMetadata: async (kind, value) => stageStoryboardMetadata(interrupted, 0, kind, value), saveRawResponse: async () => { throw new Error("NO_TERMINAL_EXPECTED"); }, saveResponse: async () => { throw new Error("NO_TERMINAL_EXPECTED"); } }); }
    catch (error) { interruptedFailure = error; }
    ok(interruptedFailure instanceof StoryboardProviderFailure);
    equal((interruptedFailure as StoryboardProviderFailure).diagnostic.category, "stream_interrupted");
    equal((interruptedFailure as StoryboardProviderFailure).diagnostic.responseId, "resp_interrupted");
    equal((await storyboardRecoveryInfo(interrupted)).availability, "provider_retrievable");
    equal(await readStoryboardResponse(interrupted, 0), null);

    const unpublished = { ...row, id: id(34) };
    const privatePrefix = `${unpublished.owner_user_id}_${unpublished.project_id}_${unpublished.job_id}_${unpublished.id}_0.json.`;
    await writeFile(join(folder, `${privatePrefix}${id(35)}.tmp`), JSON.stringify(result));
    equal(await readStoryboardResponse(unpublished, 0), result);
    const partial = { ...row, id: id(36) };
    await writeFile(join(folder, `${partial.owner_user_id}_${partial.project_id}_${partial.job_id}_${partial.id}_0.json.${id(37)}.tmp`), "{unfinished");
    equal(await readStoryboardResponse(partial, 0), null);
    const rawOnly = { ...row, id: id(38) };
    await stageStoryboardMetadata(rawOnly, 0, "created", { ...meta, responseId: "resp_synthetic" });
    await stageStoryboardRawResponse(rawOnly, 0, terminal(JSON.stringify(doc)) as never);
    globalThis.fetch = async () => { throw new Error("RAW_RECOVERY_MUST_NOT_USE_NETWORK"); };
    equal((await storyboardRecoveryInfo(rawOnly)).availability, "saved_response");
    equal((await recoverStoryboardRequest(rawOnly, 0))?.output, JSON.stringify(doc));
    ok((await readStoryboardResponse(rawOnly, 0)) !== null);

    const worker = await readFile("lib/storyboard/worker.ts", "utf8");
    ok(worker.indexOf("canCreateStoryboardRequest(") < worker.indexOf("await requestStoryboard("));
    ok(worker.includes("if (recovering ||"));
    const recovery = await readFile("lib/storyboard/response-retrieval.ts", "utf8");
    ok(recovery.includes("responses.retrieve") && !/responses\.create|images\.|\.cancel\(|\.delete\(/.test(recovery));
    const provider = await readFile("lib/storyboard/provider.ts", "utf8");
    ok(provider.includes("maxRetries: 0") && provider.includes("timeout: 180_000"));
    ok(provider.indexOf("await capture.saveResponse(saved)") < provider.indexOf("return saved"));
    console.info(JSON.stringify({ checks, SDKTransport: "mocked", liveProviderCalls: 0, workerExecution: 0, liveWrites: 0, recoveryCannotGenerate: true }));
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) { if (original[name] === undefined) delete process.env[name]; else process.env[name] = original[name]; }
    const target = resolve(folder);
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith("sceenyk-storyboard-test-")) throw new Error("INVALID_SYNTHETIC_CLEANUP_PATH");
    await rm(target, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Offline recovery check failed"); process.exitCode = 1; });
