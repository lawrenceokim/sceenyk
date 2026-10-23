import "server-only";
import { createOpenAIReferenceAnalysisProvider } from "./openai";
import type { ReferenceAnalysisProvider } from "./provider";

// Provider selection/composition stays outside the business workflow. There is
// one approved implementation and deliberately no implicit fallback.
export function createReferenceAnalysisProvider(frozenModel?: string): ReferenceAnalysisProvider {
  return createOpenAIReferenceAnalysisProvider(frozenModel);
}
