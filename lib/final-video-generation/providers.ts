import type { VideoGenerationProvider as PackageProvider } from "@/lib/video-generation-package/provider";
import type { VideoGenerationPackage } from "@/lib/video-generation-package/contract";
import type { CharacterVoiceProfile, ProviderReceipt, Scene } from "./contract";
import type { VoiceDelivery } from "@/lib/execution-v1/contract";

// Only adapters interpret payloads and opaque receipts/bindings. Core owns intent,
// authorization and durable bytes; no vendor request fields occur in this file.
export type ProviderContext = { signal: AbortSignal; received: (receipt: ProviderReceipt) => Promise<void>;
  preserveResponse?: (bytes: Buffer) => Promise<void>; replayResponse?: Buffer };
export type VoiceResponse = { receipt: ProviderReceipt; bytes?: Buffer };
export interface VideoGenerationProvider extends PackageProvider<unknown, ProviderReceipt> {
  readonly model: string;
  prepareScene(packageData: VideoGenerationPackage, scene: Scene, media: ReadonlyMap<string, string>): unknown;
  submitScene(payload: unknown, context: ProviderContext): Promise<ProviderReceipt>;
  retrieve(receipt: ProviderReceipt, context: ProviderContext): Promise<Buffer | null>;
}
export interface VoiceGenerationProvider {
  readonly id: string; readonly model: string; readonly adapterVersion: string;
  validate(profile: CharacterVoiceProfile, scenes: readonly Scene[]): string[];
  validateTiming(receipt: ProviderReceipt, durationMs: number): void;
  design(profile: CharacterVoiceProfile, context: ProviderContext): Promise<VoiceResponse>;
  bind(profile: CharacterVoiceProfile, preview: ProviderReceipt, context: ProviderContext): Promise<VoiceResponse>;
  synthesize(text: string, delivery: VoiceDelivery, profile: CharacterVoiceProfile, binding: ProviderReceipt,
    previous: readonly string[], context: ProviderContext): Promise<VoiceResponse>;
  retrieve(receipt: ProviderReceipt, context: ProviderContext): Promise<Buffer | null>;
}
export interface LipSyncProvider {
  readonly id: string; readonly model: string; readonly adapterVersion: string;
  validate(durationMs: number, width: number, height: number, videoBytes?: number, audioBytes?: number): string[];
  submit(video: string, audio: string, context: ProviderContext): Promise<ProviderReceipt>;
  retrieve(receipt: ProviderReceipt, context: ProviderContext): Promise<Buffer | null>;
}
