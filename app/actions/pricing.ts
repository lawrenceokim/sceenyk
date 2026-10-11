"use server";
import { unstable_rethrow } from "next/navigation";
import { quoteGeneration } from "@/lib/pricing/server";
import type { GenerationQuote } from "@/lib/pricing/types";
import type { GenerationResult } from "@/lib/generation/types";

export async function quoteGenerationAction(
  input: unknown,
): Promise<GenerationResult<GenerationQuote>> {
  try { return await quoteGeneration(input); }
  catch (error: unknown) {
    unstable_rethrow(error);
    console.error("Generation quote failed.", { code: "UNAVAILABLE" });
    return {
      ok: false,
      code: "UNAVAILABLE",
      message: "Generation cost couldn’t be checked. Please try again.",
    };
  }
}
