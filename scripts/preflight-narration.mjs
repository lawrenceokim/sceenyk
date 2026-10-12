// Read-only configuration/provider/catalog checks; never generates speech.
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
if (!process.env.ELEVENLABS_API_KEY || process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY) {
  console.log(JSON.stringify({ ready: false, required: 'server-only ELEVENLABS_API_KEY in local acceptance environment and Render worker; never NEXT_PUBLIC', paidCalls: 0 }));
  process.exitCode = 2;
} else {
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const catalog = async (table, columns) => {
    const result = await db.from(table).select(columns).limit(0).abortSignal(AbortSignal.timeout(15_000));
    return { check: table, available: !result.error, errorCode: result.error ? result.error.code || 'TRANSPORT_UNAVAILABLE' : null };
  };
  const provider = async (check, path, validate) => {
    try {
      const response = await fetch('https://api.elevenlabs.io/v1/' + path, { headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY }, redirect: 'error', signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        // Report only fixed error categories, never raw messages/headers.
        let reason = 'provider_rejected';
        try {
          const body = await response.json();
          if (['missing_permissions', 'invalid_api_key', 'quota_exceeded'].includes(body?.detail?.status)) reason = body.detail.status;
        } catch {}
        return { check, available: false, status: response.status, reason };
      }
      return { check, status: response.status, available: validate(await response.json()) };
    } catch { return { check, available: false, errorCode: 'TRANSPORT_UNAVAILABLE' }; }
  };
  const results = await Promise.all([
    catalog('narration_segments', 'id'), catalog('narration_assets', 'id'), catalog('generation_jobs', 'narration_execution_version,audio_ready_at'),
    provider('selected_model', 'models', value => Array.isArray(value) && value.some(m => m.model_id === 'eleven_multilingual_v2' && m.can_do_text_to_speech)),
    provider('stock_voice', 'voices/JBFqnCBsd6RMkjVDRZzb', value => value.voice_id === 'JBFqnCBsd6RMkjVDRZzb' && value.category === 'premade'),
  ]);
  // Voice Library/model metadata permissions are independent of TTS access.
  // In particular, a Free-plan stock-voice lookup rejection must not block
  // the separately authorized single speech acceptance.
  const persistentExecutionReady = results.filter(r => ['narration_segments', 'narration_assets', 'generation_jobs'].includes(r.check)).every(r => r.available);
  console.log(JSON.stringify({ credentialConfigured: true, persistentExecutionReady, results, metadataRequiredForTts: false, ttsVerified: false, paidCalls: 0 }));
  if (!persistentExecutionReady) process.exitCode = 2;
}
