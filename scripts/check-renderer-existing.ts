// Read-only replay of the accepted composition/media. No job claims, uploads,
// provider requests, receipts or accounting changes, including for failed jobs.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { z } from "zod";
import { createDatabaseClient } from "../lib/db/server";
import { compositionPlanSchema } from "../lib/composition/contract";
import { downloadPrivateMedia, serveLocalMedia, runRenderer, muxNarration, validateFinalFile } from "../lib/final-render/media";
import { renderConfiguration, RenderError } from "../lib/final-render/contract";

let stage = "environment";
async function main() {
  const require = createRequire(import.meta.url);
  const environment = require("@next/env") as typeof import("@next/env");
  environment.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  stage = "artifact";
  const accepted = JSON.parse(await fs.readFile(path.join(tmpdir(), "sceenyk-deployed-narration-acceptance.json"), "utf8"));
  stage = "database";
  const db = createDatabaseClient();
  const record = await db.from("composition_plans").select("*").eq("job_id", z.uuid().parse(accepted.jobId)).single();
  assert.ok(!record.error && record.data, "EXISTING_COMPOSITION_REQUIRED");
  const plan = compositionPlanSchema.parse(record.data.plan);
  assert.ok(plan.status === "ready" && plan.total_duration_ms === 10_000 && plan.generation_job_id === accepted.jobId, "ACCEPTED_READY_TEN_SECOND_PLAN_ONLY");
  stage = "scratch";
  const directory = await fs.mkdtemp(path.join(tmpdir(), "sceenyk-render-existing-"));
  let local: Awaited<ReturnType<typeof serveLocalMedia>> | undefined;
  try {
    const files = new Map<string, string>();
    let inputBytes = 0;
    for (const scene of plan.scenes) for (const track of ["visual", "narration"] as const) {
      const selected = scene[track];
      if (!selected) continue;
      stage = "asset-reference";
      const result = await db.rpc("composition_asset_ref", { p_scene_id: scene.scene_execution_id, p_track: track });
      const asset = z.object({ id: z.uuid(), kind: z.string(), storage_key: z.string(), verified_etag: z.string(), size_bytes: z.number().int().positive(), mime_type: z.string() }).parse(result.data);
      assert.ok(!result.error && asset.id === selected.asset_id && (track !== "visual" || asset.kind === scene.visual?.asset_kind) && asset.storage_key.startsWith(`users/${record.data.owner_user_id}/projects/${record.data.project_id}/`), "OWNED_PLAN_ASSET_REQUIRED");
      if (files.has(asset.id)) continue;
      inputBytes += asset.size_bytes;
      assert.ok(inputBytes <= renderConfiguration.maximumInputBytes, "BOUNDED_INPUT_REQUIRED");
      const file = path.join(directory, asset.id);
      stage = "private-download";
      await downloadPrivateMedia(asset, file);
      files.set(asset.id, file);
    }
    stage = "local-render";
    local = await serveLocalMedia(files);
    await fs.writeFile(path.join(directory, "input.json"), JSON.stringify({ plan, sources: local.sources }), { flag: "wx" });
    console.log(JSON.stringify({ stage: "existing_render_started", totalDurationMs: plan.total_duration_ms, uniqueMediaFiles: files.size, inputBytes }));
    const start = Date.now();
    await runRenderer(directory, AbortSignal.timeout(renderConfiguration.processTimeoutMs));
    await muxNarration(directory, files, plan);
    const output = await validateFinalFile(path.join(directory, "output.mp4"), plan);
    const metrics = JSON.parse(await fs.readFile(path.join(directory, "metrics.json"), "utf8"));
    const proof = { stage: "existing_render_verified", renderDurationMs: Date.now() - start, ...output,
      observedChildNodeRssBytes: metrics.observedRssBytes, providerRequests: 0, databaseWrites: 0, r2Writes: 0,
      scope: "local read-only existing media replay; not hosted output or a 512 MB cgroup test" };
    console.log(JSON.stringify(proof));
    await fs.writeFile(path.join(tmpdir(), "sceenyk-render-existing-result.json"), JSON.stringify(proof, null, 2));
  } finally {
    await local?.close();
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith("sceenyk-render-existing-"));
    await fs.rm(directory, { recursive: true, force: true });
  }
  assert.equal(await fs.stat(directory).catch(() => null), null);
  console.log(JSON.stringify({ passed: "existing-media replay resources removed" }));
}
main().catch(error => {
  // Assertion names and schema paths are safe; never print storage/provider errors.
  console.error(JSON.stringify({ stage, reason: error instanceof RenderError ? error.code : error instanceof assert.AssertionError ? error.message : error instanceof z.ZodError ? "EXISTING_RENDER_INVALID_" + error.issues.map(i => i.path.join(".")).join(",") : "EXISTING_RENDER_CHECK_FAILED" }));
  process.exitCode = 1;
});
