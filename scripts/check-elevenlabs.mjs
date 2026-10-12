// Real adapter/file signatures; HTTP responses are fixtures, never paid calls.
import assert from 'node:assert/strict';
import { typescriptLoader } from './lib/load-typescript.mjs';
const checks = [], check = (name, value) => { assert.ok(value, name); checks.push(name); };
let calls = 0, received = [], mode = 'success', last;
const load = typescriptLoader({}, { Response, fetch: async (url, options) => {
  calls++; last = { url, options };
  if (mode === 'network') throw new Error('DO_NOT_EXPOSE_SECRET_OR_URL');
  if (typeof mode === 'number') return new Response('raw secret provider diagnostic', { status: mode });
  if (mode === 'quota') return Response.json({ detail: { status: 'quota_exceeded', message: 'raw secret diagnostic' } }, { status: 429 });
  if (mode === 'invalid_type') return Response.json({ error: 'not audio' });
  if (mode === 'invalid_audio') return new Response('not an MP3', { headers: { 'content-type': 'audio/mpeg' } });
  // MP3 frame header signature; actual full media probe covered separately.
  return new Response(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x64]), Buffer.alloc(100)]), { headers: { 'content-type': 'audio/mpeg', 'request-id': 'fixture-request-1', 'character-cost': '6' } });
} });
const configModule = load('lib/voice-ai/config.ts'), config = configModule.getVoiceConfiguration('Dramatic');
const adapter = load('lib/voice-ai/providers/elevenlabs.ts');
const previous = process.env.ELEVENLABS_API_KEY, previousPublic = process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY, previousModel = process.env.ELEVENLABS_MODEL;
try {
  delete process.env.ELEVENLABS_API_KEY;
  await assert.rejects(() => adapter.generateSpeech('Hello.', config, async () => {}), /MISSING_CREDENTIAL/);
  check('missing key makes no HTTP request', calls === 0);
  process.env.ELEVENLABS_API_KEY = 'fixture-only-no-real-http';
  process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY = 'fixture-public-key';
  await assert.rejects(() => adapter.generateSpeech('Hello.', config, async () => {}), /MISSING_CREDENTIAL/);
  check('public credential configuration refuses provider work', calls === 0);
  delete process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY;
  const bytes = await adapter.generateSpeech('Hello.', config, async metadata => { received.push(metadata); });
  check('single POST uses fixed official host and key header', calls === 1 && last.url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/') && last.options.method === 'POST' && last.options.headers['xi-api-key'] === process.env.ELEVENLABS_API_KEY);
  const body = JSON.parse(last.options.body);
  check('central model/format/approved voice and supported settings only', body.model_id === config.modelId && last.url.includes(config.voiceId) && last.url.endsWith('output_format=mp3_44100_128') && Object.keys(body.voice_settings).sort().join() === 'similarity_boost,speed,stability,style,use_speaker_boost');
  check('bounded audio signature succeeds and usage headers captured', bytes.byteLength === 104 && received[0].requestId === 'fixture-request-1' && received[0].usage.characterCost === 6);
  check('raw cost explicitly remains provider units', received[0].usage.costBasis === 'provider_character_cost_not_usd' && configModule.estimateNarrationCost('Hello.', config).estimatedProviderCostUsd === null);
  for (const [failure, code] of [[401, 'AUTH_REJECTED'], [403, 'AUTH_REJECTED'], [402, 'QUOTA_EXHAUSTED'], [404, 'INVALID_VOICE_OR_MODEL'], [422, 'INVALID_VOICE_OR_MODEL'], [429, 'RATE_LIMIT'], [500, 'UNCERTAIN_SUBMISSION'], ['network', 'UNCERTAIN_SUBMISSION'], ['quota', 'QUOTA_EXHAUSTED'], ['invalid_type', 'INVALID_AUDIO'], ['invalid_audio', 'INVALID_AUDIO']]) {
    mode = failure; const before = calls;
    await assert.rejects(() => adapter.generateSpeech('Hello.', config, async () => {}), error => error.code === code && !error.message.includes('secret'));
    check(`safe ${failure} error makes exactly one request`, calls === before + 1);
  }
  const guardBefore = calls;
  await assert.rejects(() => adapter.generateSpeech('x'.repeat(501), config, async () => {}), /COST_GUARD/);
  check('character safeguard precedes HTTP', calls === guardBefore);
  process.env.ELEVENLABS_MODEL = 'unsupported-model';
  assert.throws(() => configModule.getVoiceConfiguration('Professional'), /INVALID_CONFIGURATION/);
  check('unsupported model fails closed centrally', true);
  delete process.env.ELEVENLABS_MODEL;
  check('tone maps deterministic supported speed/style controls', configModule.getVoiceConfiguration('Energetic').settings.speed === 1.05 && configModule.getVoiceConfiguration('Professional').settings.style === 0);
  console.log(JSON.stringify({ checks: checks.length, passed: checks, fixtureHttpRequests: calls, realProviderCalls: 0 }));
} finally {
  for (const [key, value] of [['ELEVENLABS_API_KEY', previous], ['NEXT_PUBLIC_ELEVENLABS_API_KEY', previousPublic], ['ELEVENLABS_MODEL', previousModel]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
