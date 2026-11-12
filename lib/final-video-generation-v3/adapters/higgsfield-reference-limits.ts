// Reviewed public model input_schema, not another vendor's limits or a paid probe.
// The API table omits maxItems; the same endpoint's embedded model schema includes it.
export const seedanceReferenceLimits = Object.freeze({
  version: "higgsfield-seedance-25-reference-limits-2026-11-07" as const,
  model: "bytedance/seedance-2.5/reference-to-video" as const,
  verifiedAt: "2026-11-07T00:00:00Z",
  expiresAt: null,
  sources: [
    "https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/playground",
    "https://open.higgsfield.ai/models/bytedance/seedance-2.5/reference-to-video/api-reference",
    "https://docs.higgsfield.ai/docs/concepts/file-uploads",
  ],
  maxImageCount: 30,
  // These byte ceilings are not published in the reviewed Higgsfield schema.
  // Keep the existing PNG/JPEG/WebP application subset of shared upload formats.
  maxImageBytes: null,
  imageMimeTypes: ["image/png", "image/jpeg", "image/webp"] as const,
  maxPromptBytes: null,
  maxBodyBytes: null,
});
