import "server-only";
import type { ReferenceAnalysis, ReferenceFailureCode, ReferenceRole, ReferenceUsage } from "./contract";

export type ReferenceProviderResult =
  | { ok: true; analysis: ReferenceAnalysis; usage: ReferenceUsage }
  | { ok: false; code: ReferenceFailureCode; retryable: boolean; usage: ReferenceUsage | null };

export interface ReferenceAnalysisProvider {
  readonly provider: "openai";
  readonly model: string;
  analyze(role: ReferenceRole, image: Buffer, signal: AbortSignal, referenceName?: string): Promise<ReferenceProviderResult>;
}
