import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generationContext, type ReferenceOriginals } from "../lib/final-video-generation-v3/generation-context";
import { prepareOpenAIReference } from "../lib/final-video-generation-v3/adapters/openai-reference";
import { v3ReferenceConfig, v3OpenAIConfig } from "../lib/final-video-generation-v3/runtime-config";
import { creativeTaskCurrent, taskBlocksGeneration } from "../lib/final-video-generation-v3/reference-tasks";
import { referenceBusy, v3ProgressLabel } from "../lib/final-video-generation-v3/progress";
import { workerLane } from "../lib/final-video-generation-v3/worker-command";
import { referenceContractDiagnostic } from "../lib/final-video-generation-v3/local-worker";
import { runV3Task } from "../lib/final-video-generation-v3/worker";
import { V3Store } from "../lib/final-video-generation-v3/runtime-store";
import { v3Digest } from "../lib/final-video-generation-v3/identity";
import { v3Id } from "./final-video-v3-fixture";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (a: unknown) => { assert.ok(a); checks++; };
async function main() {
const originalEnv = { ...process.env };
Object.assign(process.env, { NODE_ENV: "development", UGC_V3_ENABLED: "1", UGC_V3_OPENAI_ENABLED: "1", OPENAI_API_KEY: "fixture-only",
  UGC_V3_OPERATOR_USER_ID: v3Id(1), OPENAI_V3_IMAGE_MODEL: "fixture-openai-image", OPENAI_V3_DIRECTOR_MODEL: "", UGC_V3_HIGGSFIELD_ENABLED: "0" });
try {
  // References require the image configuration only; director setup is independent.
  equal(v3ReferenceConfig().imageModel, "fixture-openai-image");
  assert.throws(() => v3OpenAIConfig(), /V3_OPENAI_DIRECTOR_PROVIDER_UNAVAILABLE/); checks++;
  for (const key of ["UGC_V3_OPENAI_ENABLED", "OPENAI_API_KEY", "OPENAI_V3_IMAGE_MODEL"]) {
    const previous = process.env[key]; process.env[key] = "";
    assert.throws(() => v3ReferenceConfig(), /V3_OPENAI_REFERENCE_PROVIDER_UNAVAILABLE/); checks++;
    process.env[key] = previous;
  }
  const diagnostic = referenceContractDiagnostic();
  equal(diagnostic.provider, "openai"); equal(diagnostic.model, "fixture-openai-image"); equal(diagnostic.fallback, false);
  ok(!JSON.stringify(diagnostic).includes("fixture-only"));
  equal(workerLane([], true), "v3"); equal(workerLane([], false), "legacy"); equal(workerLane(["--legacy"], true), "legacy");
  for (const arg of ["--packages-only", "--final-video-only", "--resume-character", "--resume-product"]) equal(workerLane([arg], true), "legacy");
  equal(workerLane(["--project", v3Id(2)], true), "v3");
  const base = { prompt: "Introduce the subject", visual_style: "Realistic", creation_type: "ugc", ugc_type: "advertisement", tone: "Professional", category: "product-ad" };
  for (const visual_style of ["Original", "Realistic", "Anime", "Cartoon", "Cinematic"]) {
    const context = generationContext({ ...base, visual_style });
    for (const role of ["character", "product"] as const) {
      const image = new File(["fixture"], "private-input.png", { type: "image/png" });
      const subject = { role, originalId: v3Id(role === "character" ? 4 : 5), name: role === "character" ? "Ari" : "Ceramic cup" };
      const body = prepareOpenAIReference(v3ReferenceConfig().imageModel, [image], role, context, subject);
      equal(body.model, "fixture-openai-image"); equal(body.image, [image]);
      ok(body.prompt.includes(JSON.stringify(context))); ok(body.prompt.includes(subject.name)); ok(body.prompt.includes("identity"));
      ok(!/soul\/v2|higgsfield-ai/.test(JSON.stringify({ ...body, image: undefined })));
    }
  }
  const context = generationContext(base), originals: ReferenceOriginals = { character: v3Id(4), product: null, names: { character: "Ari", product: null } };
  const input = { generationContext: context, briefHash: "saved-brief", originalId: v3Id(4), provider: "openai", referenceSubject: { role: "character", originalId: v3Id(4), name: "Ari" } };
  equal(creativeTaskCurrent({ kind: "character", input }, context, "saved-brief", originals), true);
  equal(creativeTaskCurrent({ kind: "character", input }, generationContext({ ...base, visual_style: "Anime" }), "changed-brief", originals), false);
  equal(creativeTaskCurrent({ kind: "character", input: { ...input, provider: "soul" } }, context, "saved-brief", originals), false);
  equal(creativeTaskCurrent({ kind: "character", input }, context, "saved-brief", { ...originals, names: { character: "Different", product: null } }), false);
  equal(taskBlocksGeneration({ status: "queued", provider_started: false }, false), false);
  equal(taskBlocksGeneration({ status: "queued", provider_started: false }, true), true);
  equal(taskBlocksGeneration({ status: "reconciliation_required", provider_started: true }, false), true);
  const now = Date.now(), task = { kind: "character", status: "queued", current: true, providerStarted: false, createdAt: new Date(now).toISOString(), leaseUntil: null, errorCode: null };
  const state = { complete: false, tasks: [task], artifacts: [], runs: [] };
  equal(v3ProgressLabel({ ...state, tasks: [] }, false, now), "References ready to generate");
  equal(v3ProgressLabel(state, false, now), "Character Sheet queued");
  equal(v3ProgressLabel(state, false, now + 100_000), "Waiting for generation worker");
  for (const [kind, label] of [["character", "Generating Character Sheet"], ["product", "Generating Product Sheet"], ["location", "Generating Location"], ["storyboard", "Generating Storyboard"]]) {
    equal(v3ProgressLabel({ ...state, tasks: [{ ...task, kind, status: "running" }] }, false, now), label);
  }
  const artifact = { kind: "character", version: 1, current: true, approved: false, rejected: false };
  equal(v3ProgressLabel({ ...state, tasks: [], artifacts: [artifact] }, false, now), "Character Sheet ready for review");
  equal(v3ProgressLabel({ ...state, tasks: [], artifacts: [{ ...artifact, approved: true }] }, false, now), "References approved");
  equal(v3ProgressLabel({ ...state, tasks: [{ ...task, current: false }] }, false, now), "References ready to generate");
  equal(referenceBusy([{ ...task, current: false }], "character", now), false);
  equal(referenceBusy([task], "character", now), true); equal(referenceBusy([task], "product", now), false);
  // Historical runner stays byte-for-byte identical except the scoped diagnostic label.
  ok(readFileSync("scripts/ugc-legacy-worker.ts", "utf8").includes('"V1_CHARACTER_CONTRACT"'));
  ok(!readFileSync("components/creation/v3-workflow-preview.tsx", "utf8").includes("Preparing your video"));
  // Exercise the actual worker on the observed Original -> Realistic stale-queue shape.
  // Database reads/checkpoints are fixtures; an unexpected storage/provider URL fails.
  const brief = { id: v3Id(2), title: "Fixture", prompt: base.prompt, aspect_ratio: "9:16", duration: "10", visual_style: "Realistic", tone: base.tone, category: base.category, ugc_type: base.ugc_type, creation_type: "ugc" };
  let metadataReads = 0;
  globalThis.fetch = async url => {
    if (!String(url).startsWith("https://database.example.test/rest/v1/projects?")) { networkCalls++; throw new Error("PROVIDER_FORBIDDEN"); }
    metadataReads++; return Response.json([brief]);
  };
  Object.assign(process.env, { SUPABASE_URL: "https://database.example.test", SUPABASE_SECRET_KEY: "sb_secret_fixture" });
  for (const kind of ["character", "product"] as const) {
    const staleTask = { id: v3Id(40), project_id: v3Id(2), kind, status: "running", provider_started: false, lease_token: v3Id(41), lease_until: new Date(now + 60_000).toISOString(), output: null, error_code: null, created_at: new Date(now).toISOString(),
      input: { model: "fixture-openai-image", generationContext: generationContext({ ...base, visual_style: "Original" }), briefHash: v3Digest("brief", Object.fromEntries(Object.entries({ ...brief, visual_style: "Original" }).filter(([key]) => key !== "creation_type"))), originalId: v3Id(4) } };
    const workspace = { project: { project_id: v3Id(2), owner_user_id: v3Id(1), logical_job_id: v3Id(3) }, source: null, packages: [], tasks: [staleTask], artifacts: [], quotes: [], runtimeAuthorizations: [], runs: [] };
    const checkpoints: Record<string, unknown>[] = [];
    const store = new V3Store({ rpc: async (name, args) => {
      if (name === "ugc_v3_runtime_read") return { data: workspace, error: null };
      if (name === "ugc_v3_task_claim") return { data: staleTask, error: null };
      if (name === "ugc_v3_task_checkpoint") { checkpoints.push(args); return { data: true, error: null }; }
      throw new Error("UNEXPECTED_RPC");
    } });
    equal(await runV3Task(v3Id(2), v3Id(1), store), true);
    equal(checkpoints.length, 1); equal(checkpoints[0].p_action, "failed"); equal(checkpoints[0].p_payload, { code: "V3_CREATIVE_INPUT_STALE" });
  }
  equal(metadataReads, 2);
  equal(networkCalls, 0);
  console.info(`${checks} V3 reference routing/configuration/style/progress checks passed; zero provider/network calls.`);
} finally {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

}
void main().catch(error => { console.error(error instanceof Error ? error.message : "REFERENCE_CHECK_FAILED"); process.exitCode = 1; });
