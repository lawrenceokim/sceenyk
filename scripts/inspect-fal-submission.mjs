// Read-only diagnosis: capture the actual adapter request without sending it.
// Only GETs reach Supabase, private R2 and fal; no admission or paid POST.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import nextEnv from '@next/env';
import { typescriptLoader } from './lib/load-typescript.mjs';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
const state = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sceenyk-render-cloud-acceptance.json'), 'utf8'));
const old = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sceenyk-preparation-acceptance.json'), 'utf8'));
const load = typescriptLoader(), db = load('lib/db/server.ts').createDatabaseClient();
async function one(table, id) {
  const result = await db.from(table).select('*').eq('id', id).single();
  assert.ok(!result.error, 'SCOPED_READ_SUCCEEDS'); return result.data;
}
try {
  const result = await db.from('scene_executions').select('*').eq('job_id', state.jobId).eq('operation', 'video_to_video').single();
  assert.ok(!result.error, 'SCOPED_SCENE_READ_SUCCEEDS'); const scene = result.data;
  assert.equal(scene.status, 'failed'); assert.equal(scene.error_code, 'PROVIDER_REJECTED');
  assert.equal(scene.submission_attempts, 1); assert.equal(scene.provider_task_id, null);
  const segment = await one('prepared_segments', scene.prepared_asset_id);
  assert.equal(segment.status, 'completed'); assert.equal(segment.owner_user_id, scene.owner_user_id);
  const signed = await load('lib/storage/r2.ts').signR2Read(segment.storage_key, segment.verified_etag, 'video/mp4');
  let captured;
  const capture = typescriptLoader({}, { fetch: async (url, init) => {
    assert.equal(captured, undefined, 'ONE_CAPTURE_ONLY'); captured = { url, init };
    return Response.json({ request_id: 'capture-only-not-sent', status: 'IN_QUEUE' });
  } });
  await capture('lib/video-ai/providers/fal.ts').transformScene(scene, signed.url);
  const body = JSON.parse(captured.init.body), endpoint = new URL(captured.url), headers = new Headers(captured.init.headers);
  assert.equal(endpoint.href, 'https://queue.fal.run/fal-ai/ltx-2.3-quality/reference-video-to-video');
  assert.equal(captured.init.method, 'POST'); assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('authorization'), 'Key ' + process.env.FAL_KEY.trim());
  const schemaResponse = await fetch('https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=' + encodeURIComponent(scene.model), { signal: AbortSignal.timeout(30000) });
  assert.equal(schemaResponse.status, 200); const api = await schemaResponse.json();
  const ref = api.paths[endpoint.pathname].post.requestBody.content['application/json'].schema.$ref;
  const schema = api.components.schemas[ref.split('/').at(-1)];
  for (const required of schema.required) assert.ok(Object.hasOwn(body, required), 'REQUIRED_' + required);
  function valid(value, rule) {
    if (rule.$ref) return valid(value, api.components.schemas[rule.$ref.split('/').at(-1)]);
    if (rule.anyOf) return rule.anyOf.some(item => valid(value, item));
    if (rule.type === 'integer' ? !Number.isInteger(value) : typeof value !== rule.type) return false;
    if (rule.enum && !rule.enum.includes(value)) return false;
    return !(rule.minimum !== undefined && value < rule.minimum || rule.maximum !== undefined && value > rule.maximum);
  }
  for (const [key, value] of Object.entries(body)) assert.ok(schema.properties[key] && valid(value, schema.properties[key]), 'SCHEMA_FIELD_' + key);
  const media = await fetch(signed.url, { signal: AbortSignal.timeout(30000) });
  assert.equal(media.status, 200); assert.equal(Number(media.headers.get('content-length')), segment.size_bytes); await media.body?.cancel();
  console.log(JSON.stringify({ endpoint: endpoint.href, method: captured.init.method, authorization: 'Key [redacted]', contentType: headers.get('content-type'), queueStartTimeout: headers.get('x-fal-request-timeout'), schemaValidation: 'all submitted fields match current official schema', payload: { ...body, prompt: { type: 'string', characters: body.prompt.length }, video_url: '[private signed R2 capability redacted]', negative_prompt: { type: 'string', characters: body.negative_prompt.length } }, prepared: { durationMs: segment.duration_ms, width: segment.width, height: segment.height, fps: segment.fps, sizeBytes: segment.size_bytes, signedReadStatus: media.status }, originalFailedSubmissionPreserved: true }, null, 2));
  const previous = await db.from('scene_executions').select('provider_task_id,model,status').eq('job_id', old.jobId).eq('operation', 'video_to_video').single();
  assert.ok(!previous.error && previous.data.provider_task_id, 'PREVIOUS_ACCEPTED_TASK_EXISTS');
  const app = previous.data.model.split('/').slice(0, 2).join('/');
  const status = await fetch(`https://queue.fal.run/${app}/requests/${previous.data.provider_task_id}/status?logs=0`, { headers: { Authorization: 'Key ' + process.env.FAL_KEY.trim() }, signal: AbortSignal.timeout(30000) });
  let queueStatus; if (status.ok) { const data = await status.json(); queueStatus = ['IN_QUEUE', 'IN_PROGRESS', 'COMPLETED'].includes(data.status) ? data.status : 'unknown'; } else await status.body?.cancel();
  console.log(JSON.stringify({ readOnlyPreviousFalTask: { httpStatus: status.status, queueStatus, scope: 'local server environment key only; not proof of Vercel runtime response' }, paidRequestsSent: 0 }));
} catch (error) {
  console.error(JSON.stringify({ code: error instanceof assert.AssertionError ? error.message : 'FAL_INSPECTION_FAILED' })); process.exitCode = 1;
}
