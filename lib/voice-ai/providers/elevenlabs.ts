import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { voiceCredential, voiceLimits } from "../config";
import { VoiceError, type VoiceConfiguration } from "../contract";

// Official REST API, deliberately one POST with no SDK/network retry middleware.
// The persisted submission slot, not a provider idempotency assumption, gates spend.
export async function generateSpeech(text: string, config: VoiceConfiguration, received: (metadata: { requestId: string | null; usage: Record<string, unknown> }) => Promise<void>) {
  const credential = voiceCredential();
  if (!text.trim() || Array.from(text).length > voiceLimits.segmentCharacters) throw new VoiceError("COST_GUARD");
  let response: Response;
  try {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=${config.format}`, {
      method: "POST", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(voiceLimits.requestMs),
      headers: { "xi-api-key": credential, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: config.modelId, voice_settings: config.settings }),
    });
  } catch { throw new VoiceError("UNCERTAIN_SUBMISSION"); }
  if (!response.ok) {
    // Quota exhaustion can also be returned as 429. Inspect only a bounded,
    // allowlisted status; never retain or log echoed provider messages.
    let quota = false;
    if (response.status === 429 && response.body) {
      const reader = response.body.getReader(); let size = 0; const chunks: Uint8Array[] = [];
      try {
        for (;;) {
          const part = await reader.read(); if (part.done) break;
          size += part.value.byteLength; if (size > 16_384) break;
          chunks.push(part.value);
        }
        if (size <= 16_384) {
          const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (body && typeof body === "object" && "detail" in body && body.detail && typeof body.detail === "object" && "status" in body.detail) quota = ["quota_exceeded", "insufficient_credits"].includes(String(body.detail.status));
        }
      } catch {} finally { await reader.cancel().catch(() => {}); }
    } else await response.body?.cancel();
    if (quota) throw new VoiceError("QUOTA_EXHAUSTED");
    if (response.status === 429) throw new VoiceError("RATE_LIMIT", true);
    if ([401, 403].includes(response.status)) throw new VoiceError("AUTH_REJECTED");
    if (response.status === 402) throw new VoiceError("QUOTA_EXHAUSTED");
    if ([400, 404, 422].includes(response.status)) throw new VoiceError("INVALID_VOICE_OR_MODEL");
    throw new VoiceError("UNCERTAIN_SUBMISSION");
  }
  const id = response.headers.get("request-id");
  const requestId = id && /^[a-zA-Z0-9_-]{1,200}$/.test(id) ? id : null;
  const costHeader = response.headers.get("character-cost");
  const cost = costHeader !== null && /^\d+(\.\d+)?$/.test(costHeader) ? Number(costHeader) : null;
  try {
    await received({ requestId, usage: { characterCount: Array.from(text).length, characterCost: cost !== null && Number.isFinite(cost) ? cost : null, costBasis: "provider_character_cost_not_usd" } });
    if (!response.body || response.headers.get("content-type")?.split(";")[0] !== "audio/mpeg") throw new VoiceError("INVALID_AUDIO");
    const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > voiceLimits.outputBytes) throw new VoiceError("INVALID_AUDIO");
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    const bytes = Buffer.concat(chunks, size);
    if ((await fileTypeFromBuffer(bytes))?.mime !== "audio/mpeg") throw new VoiceError("INVALID_AUDIO");
    return bytes;
  } catch (error) {
    await response.body?.cancel().catch(() => {});
    if (error instanceof VoiceError) throw error;
    throw new VoiceError("OUTPUT_RECOVERY_REQUIRED");
  }
}
