import "server-only";
import { videoResolutionSchema } from "@/lib/projects/video-resolution";
import { z } from "zod";
import { higgsfieldModels } from "./higgsfield";
import { seedanceReferenceLimits } from "./higgsfield-reference-limits";

// Optional additional account evidence. Undocumented global maxima are not prerequisites.
const accountEvidenceSchema = z.strictObject({ model: z.literal(higgsfieldModels.reference), verifiedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }), sources: z.array(z.url().refine(v => ["docs.higgsfield.ai", "open.higgsfield.ai", "console.higgsfield.ai"].includes(new URL(v).hostname))).min(1),
  maxImageCount: z.number().int().positive(), maxImageBytes: z.number().int().positive(), imageMimeTypes: z.array(z.enum(["image/png", "image/jpeg", "image/webp"])).min(1),
  maxPromptBytes: z.number().int().positive(), maxBodyBytes: z.number().int().positive() });
const publicEvidenceSchema = accountEvidenceSchema.extend({ version: z.literal(seedanceReferenceLimits.version),
  expiresAt: z.null(), maxImageCount: z.literal(seedanceReferenceLimits.maxImageCount),
  maxImageBytes: z.null(), maxPromptBytes: z.null(), maxBodyBytes: z.null() });
export const validityEvidenceSchema = z.union([accountEvidenceSchema, publicEvidenceSchema]);
export function higgsfieldRequestValidation(body: Record<string, unknown>, references: { sizeBytes: number; mimeType: string; role?: string }[], evidence: unknown, now: string,
  model: string = higgsfieldModels.reference) {
  const parsed = validityEvidenceSchema.safeParse(evidence);
  const configuredError = z.object({ configurationError: z.enum(["V3_HIGGSFIELD_REFERENCE_LIMITS_UNAVAILABLE", "V3_HIGGSFIELD_REFERENCE_LIMITS_INVALID"]) }).safeParse(evidence);
  const status = model !== higgsfieldModels.reference || configuredError.success ? "invalid" : !parsed.success ? evidence == null ? "missing" : "invalid"
    : Date.parse(parsed.data.verifiedAt) > Date.parse(now) ? "invalid"
      : parsed.data.expiresAt !== null && Date.parse(parsed.data.expiresAt) <= Date.parse(now) ? "expired" : "verified";
  const maximum = status === "verified" && parsed.success ? Math.min(seedanceReferenceLimits.maxImageCount, parsed.data.maxImageCount) : seedanceReferenceLimits.maxImageCount;
  const referenceLimits = { model, imageCount: Array.isArray(body.image_urls) ? body.image_urls.length : 0, maximum,
    characterSheets: references.filter(r => r.role === "character").length, productSheets: references.filter(r => r.role === "product").length,
    locationSheets: references.filter(r => r.role === "location").length, status };
  const result = (issues: string[]) => ({ issues: [...new Set(issues)], referenceLimits });
  if (model !== higgsfieldModels.reference) return result(["V3_PRO_REFERENCE_LIMITS_UNVERIFIED"]);
  const bodyShape = z.strictObject({ prompt: z.string().min(1), duration: z.number().int().min(4).max(30), resolution: videoResolutionSchema,
    output_format: z.literal("mp4"), generate_audio: z.literal(true), aspect_ratio: z.enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]),
    image_urls: z.array(z.url()).min(1) });
  if (!bodyShape.safeParse(body).success) return result(["HIGGSFIELD_REQUEST_INVALID"]);
  const errors: string[] = [];
  if (references.length !== (body.image_urls as string[]).length) errors.push("REFERENCE_COUNT_MISMATCH");
  // Count actual URLs in this one clip's request: Character + Product + Location,
  // including any other image roles. Never trim a cast or sum across clips.
  if ((body.image_urls as string[]).length > maximum) errors.push("REFERENCE_COUNT_EXCEEDED");
  if (references.some(r => !Number.isSafeInteger(r.sizeBytes) || r.sizeBytes <= 0 || !["image/png", "image/jpeg", "image/webp"].includes(r.mimeType))) errors.push("REFERENCE_FORMAT_OR_SIZE_INVALID");
  if ((body.image_urls as string[]).some(value => { const u = new URL(value); return u.protocol !== "https:" || !!u.username || !!u.password; })) errors.push("REFERENCE_DELIVERY_INVALID");
  if (configuredError.success) return result([...errors, configuredError.data.configurationError]);
  if (status !== "verified" || !parsed.success) {
    // Preserve historical single-character quotes with no optional evidence.
    if (evidence == null && referenceLimits.characterSheets <= 1) return result(errors);
    return result([...errors, status === "expired" ? "V3_HIGGSFIELD_REFERENCE_LIMITS_EXPIRED" : "V3_PRO_REFERENCE_LIMITS_UNVERIFIED"]);
  }
  const e = parsed.data;
  if (references.some(r => e.maxImageBytes !== null && r.sizeBytes > e.maxImageBytes || !e.imageMimeTypes.includes(r.mimeType as "image/png"))) errors.push("REFERENCE_FORMAT_OR_SIZE_INVALID");
  if (e.maxPromptBytes !== null && Buffer.byteLength(String(body.prompt)) > e.maxPromptBytes || e.maxBodyBytes !== null && Buffer.byteLength(JSON.stringify(body)) > e.maxBodyBytes) errors.push("REQUEST_SIZE_EXCEEDED");
  return result(errors);
}
export function higgsfieldRequestIssues(body: Record<string, unknown>, references: { sizeBytes: number; mimeType: string; role?: string }[], evidence: unknown, now: string,
  model: string = higgsfieldModels.reference): string[] {
  return higgsfieldRequestValidation(body, references, evidence, now, model).issues;
}
