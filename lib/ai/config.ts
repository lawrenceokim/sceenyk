import "server-only";
import { z } from "zod";
import { AnalysisError } from "./types";

export function getAnalysisConfiguration() {
  const key = z.string().trim().min(1).safeParse(process.env.GEMINI_API_KEY);
  if (!key.success) throw new AnalysisError("CONFIGURATION_MISSING");
  return {
    apiKey: key.data,
    model: z.string().regex(/^gemini-[a-z0-9.-]+$/).parse(process.env.GEMINI_MODEL ?? "gemini-3.8-flash"),
    // Execution safeguards, not commercial upload quotas or retail prices.
    maximumMediaBytes: 100 * 1024 ** 2,
    maximumMediaCount: 8,
    timeoutMs: 240_000,
  };
}
