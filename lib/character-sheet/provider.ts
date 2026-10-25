import type { CharacterDiagnostic, CharacterMediaMetadata, CharacterOutputMetadata, CharacterView, Wardrobe } from "./contract";
import type { CharacterReferenceAnalysis } from "@/lib/reference-analysis/contract";
import type { CharacterGeneration } from "./generation-contract";

export type ProviderReceipt = { id: string; statusUrl?: string; responseMetadata?: CharacterOutputMetadata };
export type ProviderStatus = { state: "pending" | "completed" | "failed"; imageUrl?: string;
  diagnostic?: CharacterDiagnostic; outputMetadata?: CharacterOutputMetadata };
export interface CharacterSheetProvider {
  readonly model: string;
  createIdentity(name: string, sourceUrl: string, signal: AbortSignal): Promise<ProviderReceipt>;
  identityStatus(id: string, signal: AbortSignal): Promise<ProviderStatus>;
  submitView(input: { view: CharacterView; name: string; identityId: string; wardrobe: Wardrobe;
    analysis: CharacterReferenceAnalysis; seed: number; key: string; generation: CharacterGeneration; imageUrl: string }, signal: AbortSignal): Promise<ProviderReceipt>;
  viewStatus(id: string, statusUrl: string, signal: AbortSignal, view: CharacterView): Promise<ProviderStatus>;
  downloadImage(url: string, signal: AbortSignal): Promise<{ bytes: Buffer; media: CharacterMediaMetadata }>;
}
export class CharacterSheetError extends Error {
  constructor(readonly code: "CHARACTER_CONFIG_INVALID" | "CHARACTER_AUTH_FAILED" | "CHARACTER_RATE_LIMITED" |
    "CHARACTER_PROVIDER_FAILED" | "CHARACTER_TIMEOUT" | "CHARACTER_OUTPUT_INVALID" |
    "CHARACTER_STORAGE_FAILED" | "CHARACTER_COMPOSITION_FAILED" | "RECONCILIATION_REQUIRED",
    readonly retryable = false, readonly definitelyRejected = false,
    readonly diagnostic?: CharacterDiagnostic) { super(code); }
}
