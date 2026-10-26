// Actual adapter with a fetch fixture. No network, workers, DB, storage or paid calls.
import assert from "node:assert/strict";
import { HiggsfieldSoul2CharacterSheetProvider } from "../lib/character-sheet/higgsfield";
import { backReviewDiagnostic } from "../lib/character-v5/back-diagnostics";
import { v5Generation, v5ProviderPayload, type V5Candidate } from "../lib/character-v5/contract";

async function main() {
  let checks = 0;
  const id = "11111111-1111-4111-8111-111111111111";
  const requestId = "22222222-2222-4222-8222-222222222222";
  const settings = { HF_API_KEY_ID: id, HF_API_KEY_SECRET: "fixture-secret-never-log", UGC_CHARACTER_SHEET_ENABLED: "1",
    HIGGSFIELD_OUTPUT_HOSTS: "cdn.example.invalid", HIGGSFIELD_SOUL2_CHARACTER_MODEL: "higgsfield-ai/soul/v2/image-to-image",
    UGC_CHARACTER_V5_SOUL_ID_MODE: "reuse", NODE_ENV: "development" };
  const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  const previousFetch = globalThis.fetch; const previousInfo = console.info;
  const logs: unknown[][] = []; const submissions: { url: string; payload: unknown }[] = [];
  const source = { id, storageKey: "private/accepted-face.png", sha256: "a".repeat(64), etag: "face-etag", kind: "accepted_face" as const };
  const imageUrl = "https://private.example.invalid/private/accepted-face.png?X-Amz-Credential=private-credential&X-Amz-Signature=private-signature";
  try {
    Object.assign(process.env, settings);
    console.info = (...args: unknown[]) => { logs.push(args); };
    globalThis.fetch = async (url, init) => {
      submissions.push({ url: String(url), payload: JSON.parse(String(init?.body)) });
      return Response.json({ request_id: requestId, status_url: `https://api.higgsfield.ai/requests/${requestId}/status` });
    };
    const provider = new HiggsfieldSoul2CharacterSheetProvider();
    const result = await provider.submitManualView({ slot: "back", imageUrl, soulId: id, key: id, source }, new AbortController().signal);
    assert.equal(submissions[0].url, "https://api.higgsfield.ai/higgsfield-ai/soul/v2/image-to-image"); checks++;
    assert.deepEqual(submissions[0].payload, v5ProviderPayload(v5Generation("back", null), imageUrl)); checks++;
    const wire = submissions[0].payload as Record<string, unknown>;
    assert(!("custom_reference_id" in wire) && !("custom_reference_strength" in wire) && !("seed" in wire)); checks++;
    assert.equal(wire.image_url, imageUrl); checks++; // Only logs are redacted, never the actual input.
    assert.equal(result.id, requestId); assert.equal(result.generation.soulIdUsed, false); checks++;
    const logged = JSON.parse(String(logs[0][1]));
    assert.equal(logs[0][0], "UGC_CHARACTER_V5_BACK_PAYLOAD"); checks++;
    assert.deepEqual(logged.resolvedSource, source); checks++;
    for (const field of ["prompt", "resolution", "aspect_ratio", "batch_size", "enhance_prompt"]) { assert.equal(logged[field], wire[field]); checks++; }
    assert.equal(logged.custom_reference_id, null); assert.equal(logged.custom_reference_strength, null); checks++;
    assert(!logged.payloadFieldNames.includes("custom_reference_id") && !logged.payloadFieldNames.includes("custom_reference_strength")); checks++;
    assert.equal(logged.image_url, "https://private.example.invalid/private/accepted-face.png?[signature redacted]"); checks++;
    assert(!JSON.stringify(logs).includes("private-signature") && !JSON.stringify(logs).includes("private-credential") &&
      !JSON.stringify(logs).includes(settings.HF_API_KEY_SECRET)); checks++;
    const candidate = { id, slot: "back", request_id: requestId, artifact: { storageKey: "private/back.png", sha256: "b".repeat(64) },
      input_asset: source, generation: result.generation } as V5Candidate;
    assert.equal(backReviewDiagnostic(candidate)?.providerRequestId, requestId); checks++;
    Object.assign(process.env, { NODE_ENV: "production" });
    await provider.submitManualView({ slot: "back", imageUrl, soulId: id, key: id, source }, new AbortController().signal);
    assert.equal(logs.length, 1); assert.equal(backReviewDiagnostic(candidate), undefined); checks++;
  } finally {
    globalThis.fetch = previousFetch; console.info = previousInfo;
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  console.info(JSON.stringify({ checks, mockedSubmissions: submissions.length, providerCalls: 0, workerRuns: 0 }));
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
