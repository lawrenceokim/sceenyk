import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { saveProjectSchema } from "@/lib/projects/validation";
import type { GenerationSnapshot } from "@/lib/generation/types";

// Retail Sceenyk units only. No currency conversion or provider billing data.
// Every rule matches the complete trusted workload; unknown workloads fail closed.
const workloadSchema = z.strictObject({
  category: saveProjectSchema.shape.category,
  duration: saveProjectSchema.shape.settings.shape.duration,
  operation: z.enum(["transformation", "new_generation"]),
  modelTier: z.string().min(1).max(80),
  quality: z.string().min(1).max(80),
  features: z
    .array(z.string().min(1).max(80))
    .max(32)
    .transform((items) => [...new Set(items)].sort()),
});
const configSchema = z.strictObject({
  version: z.string().regex(/^[a-zA-Z0-9._-]{1,60}$/),
  rules: z
    .array(z.strictObject({
      workload: workloadSchema,
      credits: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    }))
    .max(512),
});
export function getPricingConfiguration() {
  const raw = process.env.SCEENYK_TEST_PRICING_JSON;
  if (!raw) return {
    mode: "unconfigured" as const,
    version: "commercial-unconfigured-v1",
    rules: [],
  };
  const config = configSchema.parse(JSON.parse(raw));
  const keys = config.rules.map((rule) => JSON.stringify(rule.workload));
  if (new Set(keys).size !== keys.length)
    throw new Error("INVALID_PRICING_CONFIGURATION");
  // Content identity prevents changing rates while reusing a human version label.
  const digest = createHash("sha256")
    .update(JSON.stringify({ contract: "commercial-v1", ...config }))
    .digest("hex");
  return {
    mode: "test" as const,
    version: `test-${config.version}-${digest}`,
    rules: config.rules,
  };
}
export function quoteGenerationCost(snapshot: GenerationSnapshot) {
  const config = getPricingConfiguration();
  // No model/quality/feature selector exists yet. Future trusted routing must
  // resolve these here, before pricing; never take a browser's pricing tier.
  const workload = workloadSchema.parse({
    category: snapshot.category,
    duration: snapshot.settings.duration,
    operation: snapshot.category === "transformation"
      ? "transformation"
      : "new_generation",
    modelTier: "unassigned",
    quality: "workspace-default",
    features: [],
  });
  const match = config.rules.find(
    (rule) => JSON.stringify(rule.workload) === JSON.stringify(workload),
  );
  return {
    pricingVersion: config.version,
    pricingMode: config.mode,
    requiredCredits: match?.credits ?? null,
    breakdown: {
      durationSeconds: Number(snapshot.settings.duration),
      creationType: snapshot.category,
      operation: workload.operation,
    },
  };
}
