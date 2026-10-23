import "server-only";
import OpenAI from "openai";

export function referenceAnalysisEnabled() {
  return process.env.UGC_REFERENCE_ANALYSIS_ENABLED === "1";
}

// Lazy: importing server modules never calls the API or requires credentials.
// Fixed official endpoint, no browser/public env, custom proxy or debug logger.
export function createReferenceAnalysisClient(frozenModel?: string) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  const model = frozenModel ?? process.env.OPENAI_REFERENCE_ANALYSIS_MODEL?.trim();
  if (!referenceAnalysisEnabled() || !apiKey || !model || !/^[a-zA-Z0-9._:-]{1,200}$/.test(model)) {
    throw new Error("REFERENCE_CONFIG_INVALID");
  }
  return {
    model,
    client: new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 60_000, logLevel: "off" }),
  };
}
