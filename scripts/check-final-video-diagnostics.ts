// Offline diagnostic/redaction/transport fixtures. No environment loading,
// workers, RPCs, provider service calls, recovery execution or SQL.
import assert from "node:assert/strict";
import { providerFailure, providerFailureSchema, redactProviderText, safeRequestValue, summarizeOperationFailure, providerRejectionBlocksRecovery, voiceLabelValidationMessage } from "../lib/final-video-generation/diagnostics";
import { jsonRequest } from "../lib/final-video-generation/adapters/http";
import { elevenLabsDesignRequest } from "../lib/final-video-generation/adapters/elevenlabs";
import { finalPreflight } from "../lib/final-video-generation/preflight";
import { finalPricing } from "../lib/final-video-generation/adapters/pricing";
import { finalProviders, adapterIdentities } from "../lib/final-video-generation/adapters/registry";
import { compositionProfile } from "../lib/final-video-generation/composition";
import { buildVideoGenerationPackage } from "../lib/video-generation-package/builder";
import { canonicalInput, fixturePricingRaw, id } from "./final-video-fixture";
import { FinalVideoError, type Operation, type ProviderReceipt } from "../lib/final-video-generation/contract";

async function main() {
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const secret = "synthetic-private-credential";
  const signed = "https://private.invalid/asset?X-Amz-Signature=synthetic-signature";
  const failure = providerFailure(422, "POST", "safe-request-id", { detail: { status: "validation_error", message: `Cannot fetch ${signed} with ${secret}` } }, [secret]);
  equal(failure.httpStatus, 422); equal(failure.providerCode, "validation_error"); equal(failure.providerRequestId, "safe-request-id");
  equal(failure.message.includes(secret), false); equal(failure.message.includes("synthetic-signature"), false);
  equal(providerFailureSchema.safeParse(failure).success, true);
  equal(providerFailure(401, "POST", "bad/id", { detail: { status: "invalid_api_key", message: "Invalid key" } }).providerRequestId, null);
  equal(providerFailure(422, "POST", null, { detail: [{ loc: ["body", "text"], msg: "Must have at least 100 characters", input: secret }] }).message,
    "body.text: Must have at least 100 characters");
  equal(providerFailure(503, "POST", null, "<html>error</html>").message, "Provider returned an HTTP error without a usable structured reason.");
  equal(redactProviderText(`Bearer abcdef xi-api-key: abcdef ${signed}`), "[REDACTED_CREDENTIAL] [REDACTED_CREDENTIAL] [REDACTED_URL]");
  equal(safeRequestValue({ image_urls: [signed], api_key: secret }, [secret]), { image_urls: ["[REDACTED_URL]"], api_key: "[REDACTED]" });
  const operation = { scene_id: "scene-2", kind: "video", provider: "fal", model: adapterIdentities.video.model, request_id: null,
    receipt: { failure } } as Operation;
  const summary = summarizeOperationFailure(operation);
  equal(summary.sceneNumber, 2); equal(summary.provider, "fal.ai"); equal(summary.httpStatus, 422); equal(summary.message, failure.message);
  equal(summarizeOperationFailure({ ...operation, scene_id: null, kind: "design", receipt: null }).httpStatus, null);
  equal(providerRejectionBlocksRecovery("FINAL_PROVIDER_REJECTED"), true);
  equal(providerRejectionBlocksRecovery("FINAL_PROVIDER_RATE_LIMIT"), true);
  equal(providerRejectionBlocksRecovery("FINAL_STORAGE_FAILED"), false);
  equal(providerRejectionBlocksRecovery("FINAL_UNCERTAIN_PROVIDER_OUTCOME"), false);
  equal(voiceLabelValidationMessage("FINAL_VOICE_LABEL_VALUE_LIMIT:language"), 'Voice binding blocked locally: label "language" exceeds 50 characters.');
  equal(voiceLabelValidationMessage("FINAL_VOICE_LABEL_VALUE_LIMIT:unsafe<script>"), null);
  equal(voiceLabelValidationMessage(null), null);
  const doc = buildVideoGenerationPackage(canonicalInput, 1);
  const plan = finalPreflight(doc, { version: "ugc-final-v1", funding: "operator_funded", authorizationId: id(80), language: "en",
    maxRequests: 8, maxEstimatedCostMicrousd: 7000000, ceilings: { video: 6250000, design: 200000, binding: 10000, voice: 100000, lip_sync: 200000 },
    providers: adapterIdentities, pricing: finalPricing(fixturePricingRaw), composition: compositionProfile,
    output: { height: 720, fps: 25, format: "mp4", toleranceMs: 50, audioSampleRate: 48000 } }, finalProviders());
  equal(elevenLabsDesignRequest(plan.profile!, plan.designPreviewText), { voice_description: "Warm conversational voice\nApproved tone: Professional. Pace: natural. Language: en. Delivery: natural",
    model_id: "eleven_multilingual_ttv_v2", auto_generate_text: false, text: "a".repeat(100), should_enhance: false });
  let recorded: ProviderReceipt[] = [], preserved = 0, fetches = 0;
  const context = { signal: new AbortController().signal, received: async (receipt: ProviderReceipt) => { recorded.push(receipt); },
    preserveResponse: async () => { preserved++; } };
  // Synthetic host only; fetch is replaced before the transport is invoked.
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => { fetches++; return Response.json({ detail: { status: "invalid_api_key", message: "Invalid API key" } },
      { status: 401, headers: { "x-request-id": "error-correlation-id" } }); };
    await assert.rejects(jsonRequest("https://synthetic.invalid/test", { method: "POST", body: JSON.stringify({ image_urls: [signed] }) }, context),
      (error: unknown) => error instanceof FinalVideoError && error.code === "FINAL_PROVIDER_REJECTED" && error.providerFailure?.httpStatus === 401); checks++;
    equal(fetches, 1); equal(preserved, 0); equal(recorded[0].request?.payload, { image_urls: ["[REDACTED_URL]"] });
    equal(recorded.at(-1)?.failure?.providerRequestId, "error-correlation-id");
    equal(recorded.at(-1)?.failure?.providerCode, "invalid_api_key");
    recorded = [];
    await assert.rejects(jsonRequest("https://synthetic.invalid/test", { method: "GET" }, context),
      (error: unknown) => error instanceof FinalVideoError && error.code === "FINAL_RECOVERY_REQUIRED" && error.providerFailure?.httpStatus === 401); checks++;
    equal(recorded.at(-1)?.failure?.method, "GET");
    for (const [status, code] of [[429, "FINAL_PROVIDER_RATE_LIMIT"], [503, "FINAL_UNCERTAIN_PROVIDER_OUTCOME"]] as const) {
      recorded = []; globalThis.fetch = async () => { fetches++; return Response.json({ detail: { message: "Provider failure" } }, { status }); };
      await assert.rejects(jsonRequest("https://synthetic.invalid/test", { method: "POST" }, context), (error: unknown) => error instanceof FinalVideoError && error.code === code); checks++;
      equal(recorded.at(-1)?.failure?.httpStatus, status);
    }
    globalThis.fetch = async () => new Response("x".repeat(40000), { status: 422 }); recorded = [];
    await assert.rejects(jsonRequest("https://synthetic.invalid/test", { method: "POST" }, context), /FINAL_PROVIDER_REJECTED/); checks++;
    equal(recorded.at(-1)?.failure?.message, "Provider returned an HTTP error without a usable structured reason.");
    equal(preserved, 0);
    globalThis.fetch = async () => { throw new Error("REPLAY_MUST_NOT_FETCH"); }; recorded = [];
    equal(await jsonRequest("https://synthetic.invalid/test", { method: "POST", body: "{}" }, { ...context, replayResponse: Buffer.from('{"saved":true}') }), { saved: true });
    equal(recorded.length, 0); equal(preserved, 1);
  } finally { globalThis.fetch = originalFetch; }
  console.info(`Final-video diagnostics checks passed: ${checks}; live I/O, RPC, worker, provider execution: none`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
