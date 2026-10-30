import "server-only";
import { z } from "zod";
import { higgsfieldModels } from "./higgsfield";

// An operator must supply actual official/account evidence. No default numeric limits are invented.
export const validityEvidenceSchema = z.strictObject({ model: z.literal(higgsfieldModels.reference), verifiedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }), sources: z.array(z.url().refine(v => ["docs.higgsfield.ai", "open.higgsfield.ai", "console.higgsfield.ai"].includes(new URL(v).hostname))).min(1),
  maxImageCount: z.number().int().positive(), maxImageBytes: z.number().int().positive(), imageMimeTypes: z.array(z.enum(["image/png", "image/jpeg", "image/webp"])).min(1),
  maxPromptBytes: z.number().int().positive(), maxBodyBytes: z.number().int().positive() });
export function higgsfieldRequestIssues(body: Record<string, unknown>, references: { sizeBytes: number; mimeType: string }[], evidence: unknown, now: string): string[] {
  const parsed = validityEvidenceSchema.safeParse(evidence);
  const bodyShape = z.strictObject({ prompt: z.string().min(1), duration: z.number().int().min(4).max(30), resolution: z.literal("480p"),
    output_format: z.literal("mp4"), generate_audio: z.literal(true), aspect_ratio: z.enum(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]),
    image_urls: z.array(z.url()).min(1) });
  if (!bodyShape.safeParse(body).success) return ["HIGGSFIELD_REQUEST_INVALID"];
  if (!parsed.success || Date.parse(parsed.data.verifiedAt) > Date.parse(now) || Date.parse(parsed.data.expiresAt) <= Date.parse(now)) return ["HIGGSFIELD_REQUEST_LIMITS_UNVERIFIED"];
  const e = parsed.data, errors: string[] = [];
  if (references.length !== (body.image_urls as string[]).length || references.length > e.maxImageCount) errors.push("REFERENCE_COUNT_EXCEEDED");
  if (references.some(r => r.sizeBytes > e.maxImageBytes || !e.imageMimeTypes.includes(r.mimeType as "image/png"))) errors.push("REFERENCE_FORMAT_OR_SIZE_INVALID");
  if (Buffer.byteLength(String(body.prompt)) > e.maxPromptBytes || Buffer.byteLength(JSON.stringify(body)) > e.maxBodyBytes) errors.push("REQUEST_SIZE_EXCEEDED");
  return errors;
}
