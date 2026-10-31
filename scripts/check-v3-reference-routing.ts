import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
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
import { CHARACTER_SHEET_PROMPT_VERSION, CHARACTER_SHEET_TEMPLATE, PRODUCT_SHEET_PROMPT_VERSION, PRODUCT_SHEET_TEMPLATE } from "../lib/final-video-generation-v3/reference-sheet-templates";
import { assertReferenceSheetPrompt, referenceSheetPromptSnapshot, referenceSourceSchema } from "../lib/final-video-generation-v3/reference-sheet-prompt";
import { purgeReferenceSpool } from "../lib/final-video-generation-v3/runtime-media";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
const ok = (a: unknown) => { assert.ok(a); checks++; };
async function main() {
const originalEnv = { ...process.env };
const diagnosticsDir = mkdtempSync(join(tmpdir(), "sceenyk-v3-diagnostics-"));
Object.assign(process.env, { NODE_ENV: "development", UGC_V3_ENABLED: "1", UGC_V3_OPENAI_ENABLED: "1", OPENAI_API_KEY: "fixture-only",
  UGC_V3_OPERATOR_USER_ID: v3Id(1), OPENAI_V3_IMAGE_MODEL: "fixture-openai-image", OPENAI_V3_DIRECTOR_MODEL: "", UGC_V3_HIGGSFIELD_ENABLED: "0", UGC_V3_RECOVERY_DIR: diagnosticsDir });
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
      ok(body.prompt.includes(`"instructions":${JSON.stringify(context.instructions)}`)); ok(body.prompt.includes(subject.name)); ok(body.prompt.includes("identity"));
      ok(!/soul\/v2|higgsfield-ai/.test(JSON.stringify({ ...body, image: undefined })));
      const template = role === "character" ? CHARACTER_SHEET_TEMPLATE : PRODUCT_SHEET_TEMPLATE;
      const styleField = role === "character" ? `**Visual style:** \`"${visual_style}"\`` : `Apply the user-selected visual style: "${visual_style}".`;
      ok(body.prompt.startsWith(template.replace("{{VISUAL_STYLE}}", visual_style)));
      equal(body.prompt.split(styleField).length - 1, 1);
      equal(body.prompt.split(`"${visual_style}"`).length - 1, 1);
      ok(!body.prompt.includes("{{VISUAL_STYLE}}")); ok(!body.prompt.includes('"visualStyle":'));
      equal(body.size, "1024x1024"); equal(body.n, 1); equal(body.quality, "high");
      if (role === "character") {
        for (const panel of ["Top Left — Side View", "Top Right — Back View", "Bottom Left — Front View", "Bottom Right — Face Close-Up"])
          ok(body.prompt.includes(panel));
        ok(body.prompt.includes("full body from the neck down"));
        ok(!body.prompt.includes("TOP-RIGHT PANEL — FRONT VIEW"));
      } else {
        for (const panel of ["TOP-LEFT PANEL — SIDE VIEW", "TOP-RIGHT PANEL — FRONT VIEW", "BOTTOM-LEFT PANEL — BACK VIEW", "BOTTOM-RIGHT PANEL — TOP VIEW"])
          ok(body.prompt.includes(panel));
        ok(body.prompt.includes("#D3D3D3")); ok(body.prompt.includes("Preserve genuine product branding"));
        ok(!body.prompt.includes("Face Close-Up"));
      }
      const snapshot = referenceSheetPromptSnapshot(role, context, subject);
      equal(snapshot.version, role === "character" ? CHARACTER_SHEET_PROMPT_VERSION : PRODUCT_SHEET_PROMPT_VERSION);
      equal(snapshot.version, 2); equal(snapshot.prompt, body.prompt);
      assertReferenceSheetPrompt(snapshot, role, context, subject); checks++;
      for (const incompatible of [undefined, { ...snapshot, version: 1 }, { ...snapshot, prompt: "old prompt" }, { ...snapshot, hash: "0".repeat(64) }]) {
        assert.throws(() => assertReferenceSheetPrompt(incompatible, role, context, subject), /V3_REFERENCE_PROMPT_OUTDATED_REGENERATE/); checks++;
      }
      assert.throws(() => assertReferenceSheetPrompt(snapshot, role, { ...context, visualStyle: visual_style === "Anime" ? "Realistic" : "Anime" }, subject), /V3_REFERENCE_PROMPT_OUTDATED_REGENERATE/); checks++;
      assert.throws(() => assertReferenceSheetPrompt(snapshot, role, context, { ...subject, name: "Different subject" }), /V3_REFERENCE_PROMPT_OUTDATED_REGENERATE/); checks++;
      const conflict = prepareOpenAIReference("fixture-openai-image", [image], role,
        { ...context, instructions: "Show six panels in a wide beach scene with dramatic shadows" }, subject);
      ok(conflict.prompt.startsWith(template.replace("{{VISUAL_STYLE}}", visual_style)));
      ok(conflict.prompt.includes("cannot override it, the specified panel order, 2×2 layout"));
    }
  }
  const source = { id: v3Id(4), etag: "frozen-upload-version", sizeBytes: 1234, mimeType: "image/png" };
  equal(referenceSourceSchema.parse(source), source);
  assert.throws(() => referenceSourceSchema.parse({ ...source, etag: "" })); checks++;
  // The final worker dispatch uses owned uploaded bytes as image edits, never a text-only/image-generator fallback.
  const workerSource = readFileSync("lib/final-video-generation-v3/worker.ts", "utf8");
  ok(workerSource.includes("client.images.edit(prepareOpenAIReference(model, await Promise.all(inputs.map"));
  ok(workerSource.includes("inputs = [(await inspectImage(raw)).bytes]"));
  ok(workerSource.includes("source.etag !== asset.data.verified_etag"));
  ok(workerSource.includes("assertReferenceSheetPrompt(task.input.referencePrompt"));
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
  await purgeReferenceSpool(v3Id(40));
  rmdirSync(diagnosticsDir);
  const recoveryDir = mkdtempSync(join(tmpdir(), "sceenyk-v3-prompts-"));
  process.env.UGC_V3_RECOVERY_DIR = recoveryDir;
  try {
    globalThis.fetch = async url => {
      const request = new URL(String(url));
      if (request.origin !== "https://database.example.test") { networkCalls++; throw new Error("PROVIDER_FORBIDDEN"); }
      if (request.pathname === "/rest/v1/projects") return Response.json([brief]);
      if (request.pathname === "/rest/v1/project_assets" && !request.searchParams.has("id"))
        return Response.json([{ id: v3Id(4), studio_role: "character", reference_name: "Ari" }, { id: v3Id(5), studio_role: "product", reference_name: "Ceramic cup" }]);
      if (request.pathname === "/rest/v1/project_assets") return Response.json({ id: request.searchParams.get("id")!.slice(3), verified_etag: "changed-source-version", size_bytes: 1234, mime_type: "image/png" });
      throw new Error("UNEXPECTED_METADATA_READ");
    };
    for (const [index, kind] of (["character", "product"] as const).entries()) {
      const subject = { role: kind, originalId: v3Id(kind === "character" ? 4 : 5), name: kind === "character" ? "Ari" : "Ceramic cup" };
      const frozenPrompt = referenceSheetPromptSnapshot(kind, context, subject);
      for (const mode of ["unversioned", "source_changed"] as const) {
        const queued = { id: v3Id(60 + index), project_id: v3Id(2), kind, status: "running", provider_started: false,
          lease_token: v3Id(41), lease_until: new Date(now + 60_000).toISOString(), output: null, error_code: null, created_at: new Date(now).toISOString(),
          input: { model: "fixture-openai-image", provider: "openai", generationContext: context,
            briefHash: v3Digest("brief", Object.fromEntries(Object.entries(brief).filter(([key]) => key !== "creation_type"))),
            originalId: subject.originalId, referenceSubject: subject, ...(mode === "source_changed" ? {
              referencePrompt: frozenPrompt, referenceSource: { ...source, id: subject.originalId } } : {}) } };
        const workspace = { project: { project_id: v3Id(2), owner_user_id: v3Id(1), logical_job_id: v3Id(3) }, source: null,
          packages: [], tasks: [queued], artifacts: [], quotes: [], runtimeAuthorizations: [], runs: [] };
        const checkpoints: Record<string, unknown>[] = [];
        const store = new V3Store({ rpc: async (name, args) => {
          if (name === "ugc_v3_runtime_read") return { data: workspace, error: null };
          if (name === "ugc_v3_task_claim") return { data: queued, error: null };
          if (name === "ugc_v3_task_checkpoint") { checkpoints.push(args); return { data: true, error: null }; }
          throw new Error("UNEXPECTED_RPC");
        } });
        equal(await runV3Task(v3Id(2), v3Id(1), store), true);
        equal(checkpoints.map(c => ({ action: c.p_action, payload: c.p_payload })), [{ action: "failed", payload: {
          code: mode === "unversioned" ? "V3_REFERENCE_PROMPT_OUTDATED_REGENERATE" : "V3_REFERENCE_SOURCE_STALE" } }]);
      }
    }
  } finally {
    for (const index of [60, 61]) await purgeReferenceSpool(v3Id(index));
    rmdirSync(recoveryDir);
  }
  equal(networkCalls, 0);
  console.info(`${checks} V3 reference routing/configuration/style/progress checks passed; zero provider/network calls.`);
} finally {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
}

}
void main().catch(error => { console.error(error instanceof Error ? error.message : "REFERENCE_CHECK_FAILED"); process.exitCode = 1; });
