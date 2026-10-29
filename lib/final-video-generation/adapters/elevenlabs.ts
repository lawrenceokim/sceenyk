import "server-only";
import type { CharacterVoiceProfile, ProviderReceipt, Scene } from "../contract";
import { FinalVideoError } from "../contract";
import type { ProviderContext, VoiceGenerationProvider, VoiceResponse } from "../providers";
import { boundedBytes, credential, jsonRequest, safeId } from "./http";
import { voiceDeliverySchema, type VoiceDelivery } from "@/lib/execution-v1/contract";
import type { CharacterTiming, SpeechTimingTarget } from "@/lib/speech-timing/plan";

export const voiceIdentity = { id: "elevenlabs", model: "eleven_multilingual_v2", version: "structured-delivery-v2" };
export function elevenLabsDelivery(value: VoiceDelivery, targetSpeedPermille?: number) {
  const d = voiceDeliverySchema.parse(value);
  if (targetSpeedPermille !== undefined && (!Number.isSafeInteger(targetSpeedPermille) || targetSpeedPermille < 700 || targetSpeedPermille > 1200))
    throw new FinalVideoError("FINAL_SPEECH_TARGET_INVALID");
  return { stability: d.energy === "calm" ? 0.65 : d.energy === "lively" ? 0.35 : 0.5, similarity_boost: 0.75,
    style: Math.min(0.6, (d.style === "expressive" ? 0.3 : d.style === "conversational" ? 0.2 : 0.1) + (d.tone === "warm" ? 0.1 : d.tone === "confident" ? 0.05 : 0) + (d.emphasis === "light" ? 0.05 : 0)),
    use_speaker_boost: true, speed: targetSpeedPermille !== undefined ? targetSpeedPermille / 1000 : d.pace === "slow" ? 0.9 : d.pace === "energetic" ? 1.1 : 1 };
}
export function elevenLabsSpeechRequest(text: string, delivery: VoiceDelivery, previous: readonly string[], timing?: SpeechTimingTarget) {
  if (timing && (timing.version !== "speech-window-v1" || !timing.feasible || !Number.isSafeInteger(timing.windowMs) || timing.windowMs <= 0))
    throw new FinalVideoError("FINAL_SPEECH_TARGET_INVALID");
  return { text, model_id: voiceIdentity.model, voice_settings: elevenLabsDelivery(delivery, timing?.targetSpeedPermille),
    ...(previous.length ? { previous_request_ids: previous.slice(-3).map(safeId) } : {}), apply_text_normalization: "off" };
}
type VoiceData = { previewRef?: string; bindingRef?: string; alignment?: unknown; normalizedAlignment?: unknown };
function description(profile: CharacterVoiceProfile) {
  return `${profile.description}\nApproved tone: ${profile.tone}. Pace: ${profile.pace}. ` +
    `Language: ${profile.language}. Delivery: ${profile.deliveryStyle.join("; ")}`;
}
export function elevenLabsDesignRequest(profile: CharacterVoiceProfile, previewText?: string) {
  if (!previewText || [...previewText].length < 100 || [...previewText].length > 1000) throw new FinalVideoError("COST_ESTIMATE_UNAVAILABLE");
  return { voice_description: description(profile), model_id: "eleven_multilingual_ttv_v2", auto_generate_text: false,
    text: previewText, should_enhance: false };
}
export function validateElevenLabsLabels(labels: Readonly<Record<string, string>>) {
  for (const [key, value] of Object.entries(labels)) {
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(key)) throw new FinalVideoError("FINAL_VOICE_LABEL_KEY_INVALID");
    if ([...value].length > 50) throw new FinalVideoError(`FINAL_VOICE_LABEL_VALUE_LIMIT:${key}`);
  }
}
export function elevenLabsBindingRequest(profile: CharacterVoiceProfile, preview: ProviderReceipt) {
  // Labels are short categorical metadata. The full profile hash stays local;
  // rich direction belongs exclusively in voice_description.
  const labels = { application: "sceenyk", language: profile.language };
  validateElevenLabsLabels(labels);
  return { voice_name: `Sceenyk ${profile.id.slice(0, 12)}`, voice_description: description(profile),
    generated_voice_id: safeId((preview.result as VoiceData | undefined)?.previewRef), labels };
}
const headers = () => ({ "xi-api-key": credential("ELEVENLABS_API_KEY"), "Content-Type": "application/json" });
function decode(value: unknown) {
  if (typeof value !== "string" || value.length > 32 * 1024 * 1024 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value))
    throw new FinalVideoError("FINAL_VOICE_OUTPUT_INVALID");
  return Buffer.from(value, "base64");
}
export function validateAlignment(value: unknown, text?: string, durationMs = 120000) {
  if (value == null) return null;
  const a = value as { characters?: unknown[]; character_start_times_seconds?: unknown[]; character_end_times_seconds?: unknown[] } | null;
  if (!a || !Array.isArray(a.characters) || a.characters.some(c => typeof c !== "string") || text !== undefined && a.characters.join("") !== text ||
    !Array.isArray(a.character_start_times_seconds) || !Array.isArray(a.character_end_times_seconds) ||
    a.characters.length !== a.character_start_times_seconds.length || a.characters.length !== a.character_end_times_seconds.length)
    throw new FinalVideoError("FINAL_VOICE_ALIGNMENT_INVALID");
  let previous = 0, previousEnd = 0;
  for (let i = 0; i < a.characters.length; i++) {
    const start = a.character_start_times_seconds[i], end = a.character_end_times_seconds[i];
    if (typeof start !== "number" || typeof end !== "number" || !Number.isFinite(start) || !Number.isFinite(end) || start < previous || end < start || end < previousEnd || end * 1000 > durationMs + 50)
      throw new FinalVideoError("FINAL_VOICE_ALIGNMENT_INVALID");
    previous = start; previousEnd = end;
  }
  return value;
}
function timingMilliseconds(value: unknown) {
  if (!value) return null;
  const a = value as { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
  return { characters: a.characters, startsMs: a.character_start_times_seconds.map(n => Math.round(n * 1000)),
    endsMs: a.character_end_times_seconds.map(n => Math.round(n * 1000)) };
}
export class ElevenLabsVoiceGenerationProvider implements VoiceGenerationProvider {
  readonly id = voiceIdentity.id; readonly model = voiceIdentity.model; readonly adapterVersion = voiceIdentity.version;
  validateTiming(receipt: ProviderReceipt, durationMs: number) {
    if (receipt.speechFit) {
      const native = (value: CharacterTiming | null) => value ? { characters: value.characters,
        character_start_times_seconds: value.startsMs.map(ms => ms / 1000), character_end_times_seconds: value.endsMs.map(ms => ms / 1000) } : null;
      validateAlignment(native(receipt.speechFit.fittedAlignment.original), undefined, durationMs);
      validateAlignment(native(receipt.speechFit.fittedAlignment.normalized), undefined, durationMs);
      return;
    }
    const data = receipt.result as VoiceData | undefined;
    validateAlignment(data?.alignment, undefined, durationMs);
    validateAlignment(data?.normalizedAlignment, undefined, durationMs);
  }
  timing(receipt: ProviderReceipt) {
    const data = receipt.result as VoiceData | undefined;
    validateAlignment(data?.alignment); validateAlignment(data?.normalizedAlignment);
    return { original: timingMilliseconds(data?.alignment), normalized: timingMilliseconds(data?.normalizedAlignment) };
  }
  validate(profile: CharacterVoiceProfile, scenes: readonly Scene[]) {
    const issues: string[] = [];
    const languages = ["en", "ja", "zh", "de", "hi", "fr", "ko", "pt", "it", "es", "id", "nl", "tr", "fil", "pl", "sv", "bg", "ro", "ar", "cs", "el", "fi", "hr", "ms", "sk", "da", "ta", "uk", "ru"];
    if (!languages.includes(profile.language)) issues.push("VOICE_LANGUAGE_UNSUPPORTED");
    // v2 provides voice settings, not arbitrary per-request direction/audio tags.
    // Unsupported delivery must stop before video spending, never be ignored.
    if (scenes.some(scene => scene.speech.some(line => line.text.trim() && !voiceDeliverySchema.safeParse(line.delivery).success))) issues.push("VOICE_DELIVERY_UNSUPPORTED");
    if (description(profile).length < 20 || description(profile).length > 1000) issues.push("VOICE_DESCRIPTION_LIMIT");
    if (scenes.some(scene => scene.speech.some(line => line.text.length > 1000))) issues.push("VOICE_TEXT_LIMIT");
    return issues;
  }
  async design(profile: CharacterVoiceProfile, context: ProviderContext, previewText?: string): Promise<VoiceResponse> {
    const response = await jsonRequest("https://api.elevenlabs.io/v1/text-to-voice/design?output_format=mp3_44100_128",
      { method: "POST", headers: headers(), body: JSON.stringify(elevenLabsDesignRequest(profile, previewText)) }, context);
    const previews = response.previews as { generated_voice_id?: string; audio_base_64?: string; media_type?: string }[] | undefined;
    if (!Array.isArray(previews) || !previews.length) throw new FinalVideoError("FINAL_VOICE_OUTPUT_INVALID");
    // Explicit versioned automatic selection: first technically valid preview.
    // Save every response to the private recovery spool before processing in core.
    const chosen = previews.find(item => typeof item.generated_voice_id === "string" && typeof item.audio_base_64 === "string" && item.media_type === "audio/mpeg");
    if (!chosen) throw new FinalVideoError("FINAL_VOICE_OUTPUT_INVALID");
    const receipt: ProviderReceipt = { result: { previewRef: safeId(chosen.generated_voice_id) }, usage: { selectionPolicy: "first-valid-v1", actualCostMicrousd: null } };
    return { receipt, bytes: decode(chosen.audio_base_64) };
  }
  async bind(profile: CharacterVoiceProfile, preview: ProviderReceipt, context: ProviderContext): Promise<VoiceResponse> {
    const payload = elevenLabsBindingRequest(profile, preview);
    const response = await jsonRequest("https://api.elevenlabs.io/v1/text-to-voice", { method: "POST", headers: headers(),
      body: JSON.stringify(payload) }, context);
    return { receipt: { result: { bindingRef: safeId(response.voice_id) }, usage: { actualCostMicrousd: null } } };
  }
  async synthesize(text: string, delivery: VoiceDelivery, profile: CharacterVoiceProfile, binding: ProviderReceipt,
    previous: readonly string[], context: ProviderContext, timing?: SpeechTimingTarget): Promise<VoiceResponse> {
    const data = binding.result as VoiceData;
    const response = await jsonRequest(`https://api.elevenlabs.io/v1/text-to-speech/${safeId(data.bindingRef)}/with-timestamps?output_format=mp3_44100_128`,
      { method: "POST", headers: headers(), body: JSON.stringify(elevenLabsSpeechRequest(text, delivery, previous, timing)) }, context);
    validateAlignment(response.alignment, text);
    validateAlignment(response.normalized_alignment);
    return { receipt: { result: { bindingRef: data.bindingRef, alignment: response.alignment,
      normalizedAlignment: response.normalized_alignment ?? null, timingVersion: 1,
      timingMs: { original: timingMilliseconds(response.alignment), normalized: timingMilliseconds(response.normalized_alignment) } },
      usage: { actualCostMicrousd: null } }, bytes: decode(response.audio_base64) };
  }
  async retrieve(receipt: ProviderReceipt, context: ProviderContext): Promise<Buffer | null> {
    if (!receipt.requestId) return null;
    // Request IDs are not history IDs. Match exactly; never select by text/name.
    const history = await jsonRequest("https://api.elevenlabs.io/v1/history?page_size=100", { method: "GET", headers: headers() }, context);
    const items = history.history as { request_id?: string; history_item_id?: string }[] | undefined;
    const matches = items?.filter(item => item.request_id === receipt.requestId) ?? [];
    if (matches.length !== 1) return null;
    const response = await fetch(`https://api.elevenlabs.io/v1/history/${safeId(matches[0].history_item_id)}/audio`,
      { headers: { "xi-api-key": credential("ELEVENLABS_API_KEY") }, redirect: "error", cache: "no-store",
        signal: AbortSignal.any([context.signal, AbortSignal.timeout(60_000)]) });
    return boundedBytes(response, 24 * 1024 * 1024);
  }
}
