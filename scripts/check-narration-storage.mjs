// Actual storage adapter/SDK command objects; R2 and FFprobe transports are fixtures.
import assert from 'node:assert/strict';
import { typescriptLoader } from './lib/load-typescript.mjs';
const checks = [], check = (name, value) => { assert.ok(value, name); checks.push(name); };
const mp3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(100)]);
let command, rejected = false;
const r2Load = typescriptLoader({
  '@aws-sdk/client-s3': { S3Client: class { async send(value) { command = value.input; if (rejected) throw { $metadata: { httpStatusCode: 412 } }; } }, PutObjectCommand: class { constructor(input) { this.input = input; } } },
  './config': { getStorageConfig: () => ({ bucket: 'private-fixture', endpoint: 'https://storage.invalid', accessKeyId: 'fixture', secretAccessKey: 'fixture' }) },
});
const r2 = r2Load('lib/storage/r2.ts');
await r2.putR2NarrationOutput('owned-key.mp3', mp3);
check('audio PUT binds MIME, length and immutable conditional write', command.ContentType === 'audio/mpeg' && command.ContentLength === mp3.length && command.IfNoneMatch === '*');
check('audio upload never requests public ACL', !('ACL' in command) && command.Bucket === 'private-fixture');
rejected = true;
await r2.putR2NarrationOutput('owned-key.mp3', mp3);
check('existing immutable object is recoverable after conditional-write conflict', true);

let stored = null, puts = 0, reads = 0;
const load = typescriptLoader({
  '@/lib/media-preparation/ffmpeg': { runMediaCommand: async () => JSON.stringify({ streams: [{ codec_type: 'audio', codec_name: 'mp3', sample_rate: '44100', channels: 1 }], format: { duration: '1.28' } }) },
  '@/lib/storage/r2': {
    inspectR2Object: async () => stored,
    putR2NarrationOutput: async () => { puts++; stored = { sizeBytes: mp3.length, mimeType: 'audio/mpeg', etag: 'fixture-etag', header: mp3 }; },
    readR2AnalysisMedia: async (key, etag, size) => { reads++; assert.equal(etag, stored.etag); assert.equal(size, stored.sizeBytes); return new ReadableStream({ start(c) { c.enqueue(mp3); c.close(); } }); },
  },
});
const storage = load('lib/voice-ai/storage.ts');
const segment = { id: 'segment', owner_user_id: 'owner', project_id: 'project', job_id: 'job' };
check('stable MP3 key binds owner/project/job/segment', storage.narrationOutputKey(segment) === 'users/owner/projects/project/generations/job/narration/segment.mp3');
check('absent stored output returns no recovery', await storage.recoverNarration(segment) === null);
const output = await storage.persistNarration(segment, mp3);
check('output metadata measured from verified persisted bytes', output.durationMs === 1280 && output.sampleRate === 44100 && output.channels === 1 && output.etag === stored.etag && puts === 1);
const recovered = await storage.recoverNarration(segment);
check('subsequent recovery reads same private output without writing', recovered.durationMs === 1280 && puts === 1 && reads === 2 && !('url' in recovered));
stored = { ...stored, mimeType: 'video/mp4' };
await assert.rejects(() => storage.recoverNarration(segment), /INVALID_STORED_AUDIO/);
stored = { ...stored, mimeType: 'audio/mpeg', header: Buffer.from('corrupt') };
await assert.rejects(() => storage.recoverNarration(segment), /INVALID_STORED_AUDIO/);
check('wrong stored MIME or signature cannot become completed output', reads === 2);
console.log(JSON.stringify({ checks: checks.length, passed: checks, realProviderCalls: 0, scope: 'actual storage with explicit R2/probe fixtures' }));
