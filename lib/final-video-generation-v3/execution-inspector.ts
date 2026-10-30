import "server-only";
import { z } from "zod";
import { packageCurrentness, readFrozenPackage } from "./package";
import { quoteSchema } from "./runtime-contract";
import { runtimePreflight } from "./execution-package";
import { higgsfieldModels } from "./adapters/higgsfield";
import { higgsfieldRequestIssues } from "./adapters/higgsfield-validity";

export function inspectExecutionEnvelope(value: unknown, now: string) {
  const envelope = z.object({ package: z.unknown(), currentInput: z.unknown(), sourceRevision: z.number().int(), sourceCurrent: z.boolean(),
    runtimeQuote: quoteSchema, runtimeAuthorization: z.unknown(), existingIntent: z.boolean().optional() }).parse(value);
  const doc = readFrozenPackage(envelope.package), quote = envelope.runtimeQuote;
  if (quote.segments.some(s => s.model !== higgsfieldModels.reference)) throw new Error("V3_INSPECTION_MODEL_UNVERIFIED");
  const validityIssues = quote.segments.flatMap(s => higgsfieldRequestIssues(s.body, doc.source.references, quote.validityEvidence, now));
  return runtimePreflight(doc, quote, envelope.runtimeAuthorization, { current: envelope.sourceCurrent && packageCurrentness(doc, envelope.currentInput, envelope.sourceRevision),
    transportEnabled: false, now, validityIssues, existingIntent: envelope.existingIntent });
}
