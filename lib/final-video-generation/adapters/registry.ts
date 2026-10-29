import "server-only";
import { FalVideoGenerationProvider, FalLipSyncProvider, visualIdentity, lipIdentity } from "./fal";
import { ElevenLabsVoiceGenerationProvider, voiceIdentity } from "./elevenlabs";
import { credential } from "./http";

export const adapterIdentities = { video: visualIdentity, voice: voiceIdentity, lip_sync: lipIdentity,
  design: { ...voiceIdentity, model: "eleven_multilingual_ttv_v2", version: "design-fixed-preview-v1" }, binding: { ...voiceIdentity, model: "text-to-voice" } };
export function assertFinalProviderConfiguration(hasSpeech: boolean) {
  credential("FAL_KEY"); if (hasSpeech) credential("ELEVENLABS_API_KEY");
}
export function finalProviders() {
  return { video: new FalVideoGenerationProvider(), voice: new ElevenLabsVoiceGenerationProvider(), lip: new FalLipSyncProvider() };
}
