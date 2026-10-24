import type { ProductDiagnostic, ProductFailureCode, productUsageSchema, ProductView } from "./contract";
import type { z } from "zod";

export interface ProductSheetProvider {
  readonly model: string;
  editView(input: { view: ProductView; original: Buffer; prompt: string; key: string }, signal: AbortSignal): Promise<{
    bytes: Buffer; requestId?: string; usage: z.infer<typeof productUsageSchema>;
  }>;
}
export class ProductSheetError extends Error {
  constructor(readonly code: ProductFailureCode | "RECONCILIATION_REQUIRED", readonly retryable = false,
    readonly definitelyRejected = false, readonly diagnostic: ProductDiagnostic = { code }) { super(code); }
}
