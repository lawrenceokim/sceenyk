import { z } from "zod";
import { saveProjectSchema } from "@/lib/projects/validation";
import { mediaKindForMime } from "@/lib/media/validation";

// One safe issue vocabulary for advisory UI, authoritative reads and enqueue.
export const ugcInputIssues = {
  AUTHENTICATION_REQUIRED: ["account", "Sign in to prepare generation."],
  PROJECT_UNAVAILABLE: ["project", "This project is unavailable."],
  CREATION_TYPE_INVALID: ["creationType", "Choose UGC to continue."],
  PROJECT_TITLE_REQUIRED: ["title", "Give your project a title."],
  PROJECT_TITLE_INVALID: ["title", "Check your project title."],
  UGC_CHARACTER_REQUIRED: ["character", "Add one character to continue."],
  UGC_CHARACTER_LIMIT: ["character", "UGC V1 supports exactly one character."],
  UGC_PRODUCT_REQUIRED: ["product", "Add one product or prop to continue."],
  UGC_PRODUCT_LIMIT: ["product", "UGC V1 supports exactly one product or prop."],
  SCENE_DESCRIPTION_REQUIRED: ["sceneDescription", "Describe your scene to continue."],
  SCENE_DESCRIPTION_TOO_LONG: ["sceneDescription", "Keep the scene description within the allowed length."],
  INVALID_DURATION: ["duration", "Choose a supported Studio duration."],
  INVALID_ASPECT_RATIO: ["aspectRatio", "Choose a supported aspect ratio."],
  INVALID_VISUAL_STYLE: ["visualStyle", "Choose a supported visual style."],
  INVALID_TONE: ["tone", "Choose a supported tone."],
  INVALID_UGC_TYPE: ["ugcType", "Choose a supported UGC type."],
  INVALID_NARRATION: ["narration", "Use the supported prompt-driven narration configuration."],
  MEDIA_NOT_FOUND: ["references", "A required reference is missing or has been removed."],
  MEDIA_NOT_OWNED: ["references", "Use references uploaded to your own project."],
  MEDIA_NOT_READY: ["references", "Finish uploading both image references to continue."],
  INVALID_IMAGE: ["references", "Use supported, verified image references."],
  MEDIA_UNAVAILABLE: ["references", "Reference storage could not be checked. Please check again."],
  SAVE_PROJECT_REQUIRED: ["project", "Save your current project changes to continue."],
  INPUT_CHANGED: ["project", "Project inputs changed. Check readiness again."],
  INVALID_SNAPSHOT: ["project", "This job has an invalid or older input snapshot. Prepare a new request."],
  READINESS_UNAVAILABLE: ["project", "Generation readiness could not be checked. Please check again."],
} as const;
export type UgcInputIssueCode = keyof typeof ugcInputIssues;
export type UgcInputIssue = { code: UgcInputIssueCode; field: string; message: string };
export type UgcReadiness = { ready: boolean; issues: UgcInputIssue[] };
export function ugcInputIssue(code: UgcInputIssueCode, field?: string): UgcInputIssue {
  return { code, field: field ?? ugcInputIssues[code][0], message: ugcInputIssues[code][1] };
}

const referenceSchema = z.strictObject({
  assetId: z.uuid(), referenceId: z.uuid(),
  mimeType: z.string().refine(value => mediaKindForMime(value) === "image"),
  sizeBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  etag: z.string().min(1).max(512),
});
export const ugcNarrationSchema = z.strictObject({ mode: z.literal("prompt") });
export const ugcDefaultNarration = { mode: "prompt" } as const;
export const ugcGenerationSnapshotSchema = z.strictObject({
  schemaVersion: z.literal(2), readiness: z.literal("validated"), projectId: z.uuid(),
  projectTitle: saveProjectSchema.shape.title,
  creationType: z.literal("ugc"), ugcType: saveProjectSchema.shape.ugcType.unwrap(),
  sceneDescription: saveProjectSchema.shape.prompt.trim().min(1),
  settings: saveProjectSchema.shape.settings,
  narration: ugcNarrationSchema,
  character: referenceSchema, product: referenceSchema,
}).refine(value => value.character.assetId !== value.product.assetId, { path: ["product"], message: "Distinct references are required." });
export type UgcGenerationSnapshot = z.infer<typeof ugcGenerationSnapshotSchema>;
export type UgcInputValidation = { ready: true; data: UgcGenerationSnapshot } | { ready: false; issues: UgcInputIssue[] };

// Maps existing Zod rules into the stable public vocabulary, without raw errors.
export function ugcIssuesFromSchema(error: z.ZodError): UgcInputIssue[] {
  const issues = error.issues.map(issue => {
    const root = String(issue.path[0] ?? "");
    if (root === "title" || root === "projectTitle") return ugcInputIssue(issue.code === "too_small" ? "PROJECT_TITLE_REQUIRED" : "PROJECT_TITLE_INVALID");
    if (root === "prompt" || root === "sceneDescription") return ugcInputIssue(issue.code === "too_big" ? "SCENE_DESCRIPTION_TOO_LONG" : "SCENE_DESCRIPTION_REQUIRED");
    if (root === "creationType") return ugcInputIssue("CREATION_TYPE_INVALID");
    if (root === "ugcType") return ugcInputIssue("INVALID_UGC_TYPE");
    if (root === "narration") return ugcInputIssue("INVALID_NARRATION");
    if (root === "settings") {
      const codes = { duration: "INVALID_DURATION", aspectRatio: "INVALID_ASPECT_RATIO", visualStyle: "INVALID_VISUAL_STYLE", tone: "INVALID_TONE" } as const;
      return ugcInputIssue(codes[issue.path[1] as keyof typeof codes] ?? "READINESS_UNAVAILABLE");
    }
    if (root === "characters" || root === "products") {
      const character = root === "characters";
      if (issue.path.length === 1 && issue.code === "too_big") return ugcInputIssue(character ? "UGC_CHARACTER_LIMIT" : "UGC_PRODUCT_LIMIT");
      if (issue.path.length === 1 && issue.code === "too_small") return ugcInputIssue(character ? "UGC_CHARACTER_REQUIRED" : "UGC_PRODUCT_REQUIRED");
      return ugcInputIssue("MEDIA_NOT_READY", character ? "character" : "product");
    }
    if (root === "character" || root === "product") return ugcInputIssue("INVALID_IMAGE", root);
    return ugcInputIssue("READINESS_UNAVAILABLE");
  });
  return uniqueUgcIssues(issues);
}
export function uniqueUgcIssues(issues: UgcInputIssue[]) {
  return issues.filter((issue, index) => issues.findIndex(other => other.code === issue.code && other.field === issue.field) === index);
}
