import { z } from "zod";
import { characterGenerationSchema, frontCropSchema } from "./generation-contract";

export const characterRejectionReasons = ["MULTIPLE_SUBJECTS", "MULTIPLE_POSES", "MULTIPLE_FACES", "COLLAGE_OR_PANEL",
  "EXTRA_INSET", "MIRRORED_POSE", "HEAD_OR_FACE_VISIBLE", "WRONG_FRONT_FRAMING", "WRONG_BACK_FRAMING",
  "WRONG_FACE_FRAMING", "FULL_BODY_IN_PORTRAIT", "MIXED_ORIENTATION", "OUTFIT_OR_FEET_CROPPED",
  "POOR_CARD_FILL", "NON_NEUTRAL_BACKGROUND", "ANNOTATIONS", "UNCERTAIN_CONTENT", "WRONG_FRONT_SOURCE_FRAMING", "UNSAFE_HEAD_CROP"] as const;
export const characterObservationsSchema = z.strictObject({
  subjects: z.number().int().min(0).max(20), poses: z.number().int().min(0).max(20), faces: z.number().int().min(0).max(20),
  headVisible: z.boolean(), fullBody: z.boolean(), frontFacing: z.boolean(), backFacing: z.boolean(),
  neckDownOnly: z.boolean(), shoulderUpCloseUp: z.boolean(), completeOutfitAndFootwear: z.boolean(),
  collageOrPanels: z.boolean(), extraInset: z.boolean(), mirroredPose: z.boolean(),
  fillsFrame: z.boolean(), neutralBackground: z.boolean(), annotations: z.boolean(), uncertain: z.boolean(),
});
export type CharacterObservations = z.infer<typeof characterObservationsSchema>;
export const characterValidationSchema = z.strictObject({
  contractVersion: z.literal(4).optional(),
  version: z.literal(1), view: z.enum(["front", "back", "face"]), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  model: z.string().min(1).max(200), state: z.enum(["intent", "passed", "rejected", "unavailable"]),
  observations: characterObservationsSchema.nullable(), reasons: z.array(z.enum(characterRejectionReasons)).max(18),
  responseId: z.string().max(200).optional(), inputTokens: z.number().int().nonnegative().nullable().optional(),
  outputTokens: z.number().int().nonnegative().nullable().optional(),
  stage: z.enum(["front_source", "canonical", "original_face"]).optional(),
  cropTop: z.number().int().min(0).max(10000).optional(), cropSafe: z.boolean().optional(),
  checkFailure: z.enum(["CONFIGURATION", "API_REFUSAL", "API_INCOMPLETE", "API_RESPONSE_INVALID", "API_UNAVAILABLE"]).optional(),
});
export type CharacterValidation = z.infer<typeof characterValidationSchema>;
export const characterInputHashesSchema = z.strictObject({ front: z.string().regex(/^[a-f0-9]{64}$/),
  back: z.string().regex(/^[a-f0-9]{64}$/), face: z.string().regex(/^[a-f0-9]{64}$/) });

export function characterContentReasons(view: CharacterValidation["view"], o: CharacterObservations) {
  const reasons: typeof characterRejectionReasons[number][] = [];
  if (o.subjects !== 1) reasons.push("MULTIPLE_SUBJECTS");
  if (o.poses !== 1) reasons.push("MULTIPLE_POSES");
  if (o.faces > 1) reasons.push("MULTIPLE_FACES");
  if (o.collageOrPanels) reasons.push("COLLAGE_OR_PANEL");
  if (o.extraInset) reasons.push("EXTRA_INSET");
  if (o.mirroredPose) reasons.push("MIRRORED_POSE");
  if (!o.fillsFrame) reasons.push("POOR_CARD_FILL");
  if (!o.neutralBackground) reasons.push("NON_NEUTRAL_BACKGROUND");
  if (o.annotations) reasons.push("ANNOTATIONS");
  if (o.uncertain) reasons.push("UNCERTAIN_CONTENT");
  if (o.frontFacing && o.backFacing) reasons.push("MIXED_ORIENTATION");
  if (view === "front") {
    if (o.headVisible || o.faces !== 0) reasons.push("HEAD_OR_FACE_VISIBLE");
    if (!o.frontFacing || o.backFacing || !o.neckDownOnly || o.shoulderUpCloseUp || o.fullBody) reasons.push("WRONG_FRONT_FRAMING");
    if (!o.completeOutfitAndFootwear) reasons.push("OUTFIT_OR_FEET_CROPPED");
  } else if (view === "back") {
    if (!o.backFacing || o.frontFacing || !o.fullBody || !o.headVisible || o.faces !== 0 || o.neckDownOnly || o.shoulderUpCloseUp) reasons.push("WRONG_BACK_FRAMING");
    if (!o.completeOutfitAndFootwear) reasons.push("OUTFIT_OR_FEET_CROPPED");
  } else {
    if (!o.shoulderUpCloseUp || !o.headVisible || o.faces !== 1 || !o.frontFacing || o.backFacing || o.neckDownOnly) reasons.push("WRONG_FACE_FRAMING");
    if (o.fullBody || o.completeOutfitAndFootwear) reasons.push("FULL_BODY_IN_PORTRAIT");
  }
  return reasons;
}
export function hasCharacterValidation(asset: { sha256: string; characterValidation?: unknown; generation?: unknown; frontCrop?: unknown; sourceValidation?: unknown } | undefined, view: CharacterValidation["view"]) {
  const parsed = characterValidationSchema.safeParse(asset?.characterValidation);
  const valid = !!asset && parsed.success && parsed.data.stage !== "front_source" && parsed.data.state === "passed" && parsed.data.view === view && parsed.data.sha256 === asset.sha256 &&
    !!parsed.data.observations && parsed.data.reasons.length === 0 && characterContentReasons(view, parsed.data.observations).filter(reason => parsed.data.contractVersion === 4 || parsed.data.stage !== "original_face" || view !== "face" || reason !== "NON_NEUTRAL_BACKGROUND").length === 0;
  if (!valid || !asset || !asset.generation) return valid;
  const generation = characterGenerationSchema.safeParse(asset.generation);
  if (!generation.success || generation.data.outputRole !== (view === "front" ? "front_source" : `${view}_reference`)) return false;
  if (view !== "front") return true;
  const crop = frontCropSchema.safeParse(asset.frontCrop);
  const source = characterValidationSchema.safeParse(asset.sourceValidation);
  return generation.success && generation.data.outputRole === "front_source" && crop.success && source.success && source.data.stage === "front_source" &&
    source.data.state === "passed" && source.data.view === "front" && !!source.data.observations && source.data.reasons.length === 0 &&
    source.data.sha256 === crop.data.sourceSha256 && crop.data.canonicalSha256 === asset.sha256 &&
    frontSourceContentReasons(source.data.observations, source.data.cropTop ?? 0, source.data.cropSafe ?? false).length === 0 &&
    crop.data.top === Math.ceil(crop.data.sourceHeight * source.data.cropTop! / 10000) && crop.data.width === crop.data.sourceWidth &&
    crop.data.height === crop.data.sourceHeight - crop.data.top;
}

export const frontSourceObservationsSchema = characterObservationsSchema.extend({
  cropTop: z.number().int().min(0).max(10000), cropSafe: z.boolean(),
});
export function frontSourceContentReasons(o: CharacterObservations, cropTop: number, cropSafe: boolean) {
  // Reuse common composition rules with the rear-only orientation rules removed.
  const reasons = characterContentReasons("back", o).filter(reason => reason !== "WRONG_BACK_FRAMING");
  if (!o.frontFacing || o.backFacing || !o.fullBody || !o.headVisible || o.faces !== 1 || o.neckDownOnly || o.shoulderUpCloseUp) reasons.push("WRONG_FRONT_SOURCE_FRAMING");
  if (!cropSafe || cropTop < 500 || cropTop > 3500) reasons.push("UNSAFE_HEAD_CROP");
  return reasons;
}
