// Focused offline approval, queue/security and synthetic FFmpeg checks only.
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { approvedV3Video } from "../lib/projects/approved-video";
import { projectPreviewKey } from "../lib/projects/video-preview-contract";
import { encodeProjectVideoPreview } from "../lib/projects/video-preview-media";
import { runMediaCommand, probeMedia } from "../lib/media-preparation/ffmpeg";

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("NETWORK_FORBIDDEN"); };
  const owner = randomUUID(), project = randomUUID(), pkg = randomUUID(), run = randomUUID();
  let checks = 0;
  const equal = (a: unknown, b: unknown) => { assert.deepEqual(a, b); checks++; };
  const asset = { id: run, storageKey: `users/${owner}/projects/${project}/v3/${run}.mp4`, etag: '"original"', sha256: "a".repeat(64),
    sizeBytes: 1234, mimeType: "video/mp4", durationMs: 5000, width: 640, height: 480, hasAudio: true };
  const snapshot = { project: { project_id: project, owner_user_id: owner }, source: { current: true, revision: 2 },
    packages: [{ id: pkg, document: { hash: "package", sourceRevision: 2, segments: [{}] } }],
    runs: [{ id: run, package_id: pkg, state: "approved", current: true, completed_at: new Date().toISOString(), result: asset }], artifacts: [] as unknown[] };
  const approved = approvedV3Video(snapshot, owner, project)!;
  assert.ok(approved); checks++;
  equal(approvedV3Video(snapshot, randomUUID(), project), null);
  equal(approvedV3Video({ ...snapshot, source: { current: false, revision: 2 } }, owner, project), null);
  for (const state of ["awaiting_review", "failed", "deleted"]) equal(approvedV3Video({ ...snapshot, runs: [{ ...snapshot.runs[0], state }] }, owner, project), null);
  equal(approvedV3Video({ ...snapshot, runs: [{ ...snapshot.runs[0], completed_at: null }] }, owner, project), null);
  equal(approvedV3Video({ ...snapshot, runs: [{ ...snapshot.runs[0], current: false }] }, owner, project), null);
  equal(approvedV3Video({ ...snapshot, runs: [{ ...snapshot.runs[0], result: { ...asset, storageKey: `users/${randomUUID()}/other.mp4` } }] }, owner, project), null);
  const multi = { ...snapshot, packages: [{ id: pkg, document: { ...snapshot.packages[0].document, segments: [{}, {}] } }] };
  equal(approvedV3Video(multi, owner, project), null);
  const joined = { ...multi, artifacts: [{ id: randomUUID(), kind: "joined", version: 1, approved_at: new Date().toISOString(), rejected_at: null,
    document: { packageId: pkg, packageHash: "package", asset } }] };
  assert.ok(approvedV3Video(joined, owner, project)); checks++;
  equal(approvedV3Video({ ...joined, artifacts: [{ ...joined.artifacts[0], rejected_at: new Date().toISOString() }] }, owner, project), null);
  equal(approvedV3Video({ ...joined, artifacts: [{ ...joined.artifacts[0], document: { ...joined.artifacts[0].document, packageHash: "different" } }] }, owner, project), null);
  equal(approvedV3Video(structuredClone(snapshot), owner, project)?.version, approved.version);
  assert.notEqual(approvedV3Video({ ...snapshot, runs: [{ ...snapshot.runs[0], result: { ...asset, sha256: "b".repeat(64) } }] }, owner, project)?.version, approved.version); checks++;
  equal(projectPreviewKey({ owner_user_id: owner, project_id: project, version: approved.version }), `users/${owner}/projects/${project}/project-previews/${approved.version}.mp4`);
  const db = new PGlite();
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), "sceenyk-preview-check-"));
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.projects(id uuid primary key,owner_user_id uuid not null,deleted_at timestamptz,unique(id,owner_user_id));
      insert into public.projects values('${project}','${owner}',null);`);
    const migration = await fs.readFile("supabase/migrations/20261111011200_project_video_previews.sql", "utf8");
    await db.exec(migration); await db.exec(migration); checks++;
    const request = async (user = owner) => (await db.query<{ item: { id: string; lease_token: string; state: string } | null }>(
      "select public.project_video_preview_request($1,$2,$3) item", [user, project, approved.version])).rows[0].item;
    equal(await request(randomUUID()), null);
    const first = (await request())!;
    equal((await request())!.id, first.id);
    equal((await db.query("select * from public.project_video_previews")).rows.length, 1);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(() => request()); checks++;
      await assert.rejects(() => db.query("select * from public.project_video_previews")); checks++;
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    equal((await request())!.id, first.id);
    const claim = async () => (await db.query<{ item: { id: string; lease_token: string; state: string } | null }>("select public.project_video_preview_claim() item")).rows[0].item;
    const claimed = (await claim())!;
    equal(claimed.id, first.id); equal(await claim(), null);
    const finish = async (token: string, etag: string | null) => (await db.query<{ ok: boolean }>(
      "select public.project_video_preview_finish($1,$2,$3,$4,false) ok", [claimed.id, token, etag, etag ? 1024 : null])).rows[0].ok;
    equal(await finish(randomUUID(), '"saved"'), false);
    equal(await finish(claimed.lease_token, null), true);
    equal(await claim(), null); // Backoff, even with another page request.
    await request(); equal(await claim(), null);
    await db.exec("reset role; update public.project_video_previews set retry_after=now()-interval '1 second'; set role service_role");
    const retried = (await claim())!;
    equal(await finish(claimed.lease_token, '"stale"'), false);
    equal(await finish(retried.lease_token, '"saved"'), true);
    equal((await request())!.state, "ready"); equal(await claim(), null);
    await db.exec(`reset role; update public.projects set deleted_at=now() where id='${project}'; set role service_role`);
    equal(await request(), null);
    for (const size of ["640x360", "360x640"]) {
      const input = path.join(temporary, `${size}.mp4`), output = path.join(temporary, `${size}-preview.mp4`);
      await runMediaCommand("ffmpeg", ["-v", "error", "-nostdin", "-y", "-f", "lavfi", "-i", `testsrc2=size=${size}:rate=24:duration=4`,
        "-f", "lavfi", "-i", "sine=frequency=440:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-threads", "1", input]);
      const before = await fs.readFile(input);
      await encodeProjectVideoPreview(input, output);
      const meta = await probeMedia(output);
      equal(meta.durationMs, 3000); equal(meta.hasAudio, false); equal(meta.fps, 15);
      equal(Math.max(meta.width, meta.height), 480);
      equal(await fs.readFile(input), before);
    }
    console.log(JSON.stringify({ checks, realNetworkCalls: 0, paidRequests: 0 }));
  } finally {
    globalThis.fetch = originalFetch;
    await db.close();
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
