import "server-only";
import { z } from "zod";
import { CharacterSheetError } from "./provider";

// Only this reviewed model contract is enabled. A new model needs an adapter review.
const configSchema = z.strictObject({
  enabled: z.literal("1"), keyId: z.uuid(), secret: z.string().min(1).max(1024).regex(/^[\x21-\x7e]+$/)
    .refine(value => !/[:'"]/.test(value)),
  model: z.literal("higgsfield-ai/soul/v2/standard"),
  outputHosts: z.array(z.string().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/)).min(1).max(10),
});
export class CharacterSheetConfigurationError extends CharacterSheetError {
  constructor(readonly issue: "HF_SECRET_CONTAINS_COMPLETE_CREDENTIAL" | "CHARACTER_ENVIRONMENT_INVALID") {
    super("CHARACTER_CONFIG_INVALID", true);
  }
}
export function characterSheetEnvironmentPresence() {
  return Object.fromEntries(["HF_API_KEY_ID", "HF_API_KEY_SECRET", "HIGGSFIELD_SOUL2_MODEL", "UGC_CHARACTER_SHEET_ENABLED",
    "HIGGSFIELD_OUTPUT_HOSTS"].map(name => [name, process.env[name] ? "PRESENT" : "MISSING"]));
}
export function getCharacterSheetConfig() {
  const keyId = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  // The Console may copy KEY_ID:SECRET as one credential. This adapter accepts
  // separate fields; never concatenate the ID twice or silently change accounts.
  if (keyId && secret?.startsWith(`${keyId}:`)) {
    throw new CharacterSheetConfigurationError("HF_SECRET_CONTAINS_COMPLETE_CREDENTIAL");
  }
  const config = configSchema.safeParse({
    enabled: process.env.UGC_CHARACTER_SHEET_ENABLED, keyId,
    secret, model: process.env.HIGGSFIELD_SOUL2_MODEL,
    outputHosts: (process.env.HIGGSFIELD_OUTPUT_HOSTS ?? "").split(",").map(x => x.trim()).filter(Boolean),
  });
  if (!config.success) throw new CharacterSheetConfigurationError("CHARACTER_ENVIRONMENT_INVALID");
  return config.data;
}
