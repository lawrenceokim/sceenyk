import assert from "node:assert/strict";
import { v3Id } from "./final-video-v3-fixture";
import { v3RuntimeEnabled, v3UserAllowed, v3TransportConfig } from "../lib/final-video-generation-v3/runtime-config";
import { eligibleForV3 } from "../lib/final-video-generation-v3/enrollment";
import { processV3QueueBatch, V3ProjectPool } from "../lib/final-video-generation-v3/background-worker";
import { mkdtemp, writeFile, utimes, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { V3Store } from "../lib/final-video-generation-v3/runtime-store";
import { videoExecutionLabel, shouldPollV3Video } from "../lib/final-video-generation-v3/video-progress";
import { v3ProgressLabel } from "../lib/final-video-generation-v3/progress";
import { finalVideoPresentation } from "../components/creation/v3-final-video-state";
import { newlyAvailableVideo } from "../components/creation/studio-video-selection";
import type { RuntimeDto } from "../lib/final-video-generation-v3/runtime-server";

let checks = 0, networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("NETWORK_FORBIDDEN"); };
const eq = (actual: unknown, expected: unknown) => { assert.deepEqual(actual, expected); checks++; };
const oldEnv = { ...process.env };
async function main() {
  const a = v3Id(701), b = v3Id(702);
  Object.assign(process.env, { NODE_ENV: "production", UGC_V3_ENABLED: "1", UGC_V3_ACCESS_MODE: "owned", UGC_V3_HIGGSFIELD_ENABLED: "0" });
  delete process.env.UGC_V3_OPERATOR_USER_ID;
  eq(v3RuntimeEnabled(), true); eq(v3UserAllowed(a), true); eq(v3UserAllowed(b), true); eq(v3UserAllowed("forged-owner"), false);
  eq(eligibleForV3(a, "ugc"), true); eq(eligibleForV3(b, "ugc"), true); eq(eligibleForV3(b, "freestyle"), false);
  eq(v3TransportConfig().enabled, false);
  process.env.UGC_V3_HIGGSFIELD_ENABLED = "1"; eq(v3TransportConfig().enabled, true);
  process.env.UGC_V3_ACCESS_MODE = "unrecognized"; eq(v3RuntimeEnabled(), false); eq(v3UserAllowed(a), false);
  process.env.UGC_V3_ACCESS_MODE = "operator"; eq(v3RuntimeEnabled(), false);
  Object.assign(process.env, { NODE_ENV: "development", UGC_V3_OPERATOR_USER_ID: a });
  eq(v3UserAllowed(a), true); eq(v3UserAllowed(b), false);
  process.env.UGC_V3_ENABLED = "0"; eq(v3UserAllowed(a), false);
  Object.assign(process.env, { NODE_ENV: "production", UGC_V3_ACCESS_MODE: "owned", UGC_V3_ENABLED: "1" });

  const projects = [{ project_id: v3Id(711), owner_user_id: a }, { project_id: v3Id(712), owner_user_id: b }];
  const observed: unknown[] = [];
  const store = new V3Store({ rpc: async (name, args) => {
    eq(name, "ugc_v3_worker_projects"); eq(args.p_owner, null); eq(args.p_limit, 32);
    return { data: args.p_after ? [] : projects, error: null };
  } });
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  const result = await processV3QueueBatch(store, { after: null, ownerId: null, concurrency: 2, signal: new AbortController().signal }, async project => {
    observed.push(project);
    if (project.owner_user_id === a) { await first; throw new Error("V3_FIXTURE_PROJECT_PAUSED"); }
    release();
  });
  eq(observed, projects); eq(result.count, 2); eq(result.after, projects[1].project_id);
  eq(result.failures, [{ projectId: projects[0].project_id, code: "V3_FIXTURE_PROJECT_PAUSED" }]);
  eq((await processV3QueueBatch(store, { after: result.after, ownerId: null, concurrency: 2, signal: new AbortController().signal })).after, null);
  let finishSlow!: () => void;
  const slow = new Promise<void>(resolve => { finishSlow = resolve; });
  const started: string[] = [], failures: string[] = [];
  const pool = new V3ProjectPool(2, async project => {
    started.push(project.project_id);
    if (project.project_id === projects[0].project_id) await slow;
    if (project.project_id === v3Id(713)) throw new Error("FIXTURE_STOPPED");
  }, project => { failures.push(project.project_id); });
  const signal = new AbortController().signal;
  eq(pool.schedule(projects[0], signal), true); eq(pool.schedule(projects[1], signal), true);
  eq(pool.schedule(projects[0], signal), false); eq(pool.size, 2);
  await new Promise(resolve => setTimeout(resolve, 0));
  eq(pool.size, 1);
  eq(pool.schedule({ project_id: v3Id(713), owner_user_id: b }, signal), true);
  await new Promise(resolve => setTimeout(resolve, 0));
  eq(started.includes(v3Id(713)), true); eq(failures, [v3Id(713)]);
  finishSlow(); await pool.drain(); eq(pool.size, 0);

  for (const [state, stage, label] of [
    ["queued", "V3_FINAL_VIDEO_JOB_CLAIMED", "Queued"], ["submitting", "HIGGSFIELD_SUBMITTING", "Submitting"],
    ["provider_processing", "HIGGSFIELD_PROCESSING", "Processing"], ["provider_processing", "HIGGSFIELD_RESULT_RECEIVED", "Downloading"],
    ["provider_processing", "V3_FINAL_VIDEO_SAVING", "Saving"], ["awaiting_review", "V3_FINAL_VIDEO_READY_FOR_REVIEW", "Ready for Review"],
  ]) {
    const run = { state, stage: { stage } };
    eq(videoExecutionLabel(run), label);
    eq(v3ProgressLabel({ complete: false, runs: [run], artifacts: [], tasks: [{ kind: "video", status: "queued", current: true,
      providerStarted: state !== "queued", createdAt: "2000-01-01T00:00:00Z", leaseUntil: null, errorCode: null }] }, false), label);
  }
  eq(shouldPollV3Video([{ state: "provider_processing" }]), true);
  eq(shouldPollV3Video([{ state: "reconciliation_required", hasKnownRequest: true }]), true);
  eq(shouldPollV3Video([{ state: "reconciliation_required", hasKnownRequest: false }]), true);
  eq(shouldPollV3Video([{ state: "awaiting_review", preview: "https://private.example.test/video" }]), false);
  const ready = { preflight: { packageId: v3Id(720), segmentCount: 1 }, runs: [{ packageId: v3Id(720), state: "awaiting_review", preview: "private-video" }], tasks: [] } as unknown as RuntimeDto;
  eq(finalVideoPresentation(ready, { dirty: false, busy: false, requestPending: false }).loading, false);
  const joining = { ...ready, runs: [], tasks: [{ kind: "join", status: "queued" }] } as unknown as RuntimeDto;
  eq(finalVideoPresentation(joining, { dirty: false, busy: false, requestPending: false }).reason, "Saving the final video.");
  eq(v3ProgressLabel(joining, false), "Saving");

  const seen = new Set<string>();
  eq(newlyAvailableVideo([{ id: "character", kind: "image" }], seen), undefined);
  eq(newlyAvailableVideo([{ id: "same-run-video", kind: "video" }], seen), "same-run-video");
  eq(newlyAvailableVideo([{ id: "same-run-video", kind: "video" }], seen), undefined);
  eq(newlyAvailableVideo([{ id: "same-run-video", kind: "video" }, { id: "joined-final", kind: "video" }], seen), "joined-final");
  const directory = await mkdtemp(join(tmpdir(), "sceenyk-v3-health-")), file = join(directory, "worker-heartbeat.json");
  try {
    await writeFile(file, "{}");
    const check = () => spawnSync(process.execPath, ["scripts/check-ugc-v3-worker-health.mjs"], { env: { ...process.env, UGC_V3_RECOVERY_DIR: directory }, windowsHide: true }).status;
    eq(check(), 0);
    const stale = new Date(Date.now() - 120_000); await utimes(file, stale, stale); eq(check(), 1);
  } finally { await unlink(file); await rmdir(directory); }
  eq(networkCalls, 0);
  console.info(`${checks} V3 access, background scheduling, saved progress and automatic Preview checks passed; zero real network calls.`);
}
void main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  for (const key of Object.keys(process.env)) if (!(key in oldEnv)) delete process.env[key];
  Object.assign(process.env, oldEnv);
});
