import "server-only";
import { z } from "zod";
import { VoiceError, type VoiceConfiguration } from "./contract";

export const voiceLimits = { segmentCharacters: 500, jobCharacters: 1000, outputBytes: 10 * 1024 ** 2, requestMs: 90_000, maximumDurationMs: 120_000 } as const;
// Stock George voice from the official quickstart; no browser voice overrides.
const approvedVoice = "JBFqnCBsd6RMkjVDRZzb";
export function getVoiceConfiguration(tone: string): VoiceConfiguration {
  const model = z.enum(["eleven_multilingual_v2", "eleven_flash_v2_5"]).safeParse(process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2");
  if (!model.success) throw new VoiceError("INVALID_CONFIGURATION");
  const expressive = ["Funny", "Dramatic", "Storytelling"].includes(tone);
  return { provider: "elevenlabs", voiceId: approvedVoice, modelId: model.data, format: "mp3_44100_128", version: "narration-v1-2026-10-12",
    settings: { stability: expressive ? .4 : .6, similarity_boost: .75, style: expressive ? .2 : 0, use_speaker_boost: true, speed: tone === "Energetic" ? 1.05 : 1 } };
}
export function voiceCredential() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (process.env.NEXT_PUBLIC_ELEVENLABS_API_KEY || !key || !key.trim() || key !== key.trim()) throw new VoiceError("MISSING_CREDENTIAL");
  return key;
}
export function estimateNarrationCost(text: string, configuration: VoiceConfiguration) {
  return { characterCount: Array.from(text).length, estimatedProviderCostUsd: null, pricingVersion: configuration.version, costBasis: "billing_rate_unavailable" };
}
