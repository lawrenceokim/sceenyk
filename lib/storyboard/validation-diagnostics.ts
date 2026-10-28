import { z } from "zod";

export type StoryboardValidationIssue = {
  code: string; fieldPath: string; expected: string | number; received: string | number | boolean | null;
  expectedType: string; receivedType: string; sceneNumber?: number;
};
export type StoryboardNormalization = { code: string; fieldPath: string; from: string | number | null; to: string | number };
export type StoryboardValidationReport = { validatorVersion: 2; valid: boolean; requestIndex?: number;
  issues: StoryboardValidationIssue[]; normalizations: StoryboardNormalization[] };
export const validationReportSchema = z.strictObject({ validatorVersion: z.literal(2), valid: z.boolean(), requestIndex: z.number().int().min(0).max(1).optional(),
  issues: z.array(z.strictObject({ code: z.string().regex(/^[A-Z_]+$/), fieldPath: z.string().max(200), expected: z.union([z.string().max(250), z.number()]),
    received: z.union([z.string().max(250), z.number(), z.boolean(), z.null()]), expectedType: z.string().max(80), receivedType: z.string().max(80), sceneNumber: z.number().int().optional() })).max(1000),
  normalizations: z.array(z.strictObject({ code: z.string().regex(/^[A-Z_]+$/), fieldPath: z.string().max(200), from: z.union([z.string().max(250), z.number(), z.null()]), to: z.union([z.string().max(250), z.number()]) })).max(1000),
});
export class StoryboardValidationError extends Error {
  constructor(readonly report: StoryboardValidationReport) { super(report.issues[0]?.code ?? "STORYBOARD_OUTPUT_INVALID"); }
}
const knownFields = new Set(["schemaVersion", "title", "concept", "durationMs", "aspectRatio", "visualStyle", "tone", "voice", "characterAssetId", "description", "pace", "continuity", "identity", "appearance", "outfit", "product", "location", "scenes", "number", "startMs", "endMs", "purpose", "productAssetId", "locationAssetId", "actions", "movement", "gesture", "expression", "productInteraction", "productPosition", "camera", "angle", "shot", "framing", "zoom", "focus", "lighting", "direction", "intensity", "colors", "atmosphere", "speech", "speaker", "text", "delivery", "audio", "background", "effects", "music", "transition", "generationNotes", "generationPrompt", "wordCount", "characterCount", "totalWordCount"]);
const executionFields = new Set(["transitionNote", "type", "durationMs", "requirement", "assetId", "energy", "tone", "emphasis", "style", "deliveryNote"]);
export function validationPath(path: PropertyKey[]) {
  return path.reduce<string>((out, part) => typeof part === "number" ? `${out}[${part}]` : `${out}.${knownFields.has(String(part)) || executionFields.has(String(part)) ? String(part) : "<unexpected-field>"}`, "$");
}
export function validationValue(value: unknown): Pick<StoryboardValidationIssue, "received" | "receivedType"> {
  const receivedType = value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
  return { receivedType, received: typeof value === "number" && Number.isFinite(value) || typeof value === "boolean" || value === null ? value as number | boolean | null :
    typeof value === "string" ? `string(length=${[...value].length})` : Array.isArray(value) ? `array(length=${value.length})` : receivedType };
}
export function fieldValue(root: unknown, path: PropertyKey[]): unknown {
  let value = root;
  for (const key of path) { if (!value || typeof value !== "object") return undefined; value = (value as Record<PropertyKey, unknown>)[key]; }
  return value;
}
export function schemaValidationIssues(error: z.ZodError, value: unknown): StoryboardValidationIssue[] {
  return error.issues.map(issue => {
    const data = issue as unknown as Record<string, unknown>;
    const at = fieldValue(value, issue.path);
    const sceneIndex = issue.path[0] === "scenes" && typeof issue.path[1] === "number" ? issue.path[1] : undefined;
    return { code: `SCHEMA_${issue.code.toUpperCase()}`, fieldPath: validationPath(issue.path),
      expected: issue.code === "invalid_type" ? String(data.expected) : issue.code === "unrecognized_keys" ? "only declared schema fields" :
        issue.code === "invalid_value" ? `one of ${JSON.stringify(data.values)}` : issue.code === "too_small" ? `minimum ${String(data.minimum)}` :
          issue.code === "too_big" ? `maximum ${String(data.maximum)}` : "declared schema format",
      expectedType: issue.code === "invalid_type" ? String(data.expected) : "schema constraint", ...validationValue(at),
      ...(sceneIndex === undefined ? {} : { sceneNumber: sceneIndex + 1 }) };
  });
}
