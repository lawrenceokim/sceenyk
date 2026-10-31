import { z } from "zod";
import { v3Digest } from "./identity";

export const LOCATION_VERSION = "location-prompt-v2";
export const LEGACY_LOCATION_VERSION = "ai-location-director-v1";
export const LOCATION_STEPS = ["plan", "sheet"] as const;
export const locationInstructionSchema = z.strictObject({ name: z.string().trim().min(1).max(200),
  prompt: z.string().trim().min(1).max(24000) });
export type LocationInstruction = z.infer<typeof locationInstructionSchema>;
export const locationInstructionHash = (value: LocationInstruction) => v3Digest("location-instruction", value);

// Read old saved state/receipts without asking AI to assess or repair an image again.
const legacyObject = z.record(z.string(), z.unknown());
const receipt = z.object({ key: z.enum(["plan", "sheet", "check", "repair", "recheck"]), id: z.uuid(),
  status: z.enum(["intent", "saved", "rejected"]), httpStatus: z.number().int().min(100).max(599).nullable(),
  requestId: z.string().nullable(), responseId: z.string().nullable(), responseHash: z.string().nullable(), usage: z.unknown().optional() });
export const locationStateSchema = z.object({ schema: z.enum([LOCATION_VERSION, LEGACY_LOCATION_VERSION]),
  phase: z.enum(["plan", "sheet", "check", "repair", "recheck", "publish", "complete"]),
  requests: z.array(receipt).max(5), instruction: locationInstructionSchema.nullable().default(null), instructionHash: z.string().nullable().default(null),
  blueprint: legacyObject.nullable().default(null), blueprintHash: z.string().nullable().default(null), quality: z.unknown().nullable().default(null),
  sheetId: z.uuid().nullable(), recoveryOnly: z.boolean(), errorCode: z.string().nullable() });
export type LocationState = z.infer<typeof locationStateSchema>;
export function locationState(value: unknown): LocationState {
  if (value === null || value === undefined) return { schema: LOCATION_VERSION, phase: "plan", requests: [],
    instruction: null, instructionHash: null, blueprint: null, blueprintHash: null, quality: null,
    sheetId: null, recoveryOnly: false, errorCode: null };
  return locationStateSchema.parse(value);
}
export function legacyLocationInstruction(value: unknown): LocationInstruction {
  const b = legacyObject.parse(value);
  if(!["purpose","environment","surroundings","architecture"].some(k=>typeof b[k]==="string"&&(b[k] as string).trim()))throw new Error("V3_LOCATION_INSTRUCTION_INVALID");
  return locationInstructionSchema.parse({ name: typeof b.name === "string" ? b.name : "Location",
    prompt: "Create the empty location described by these saved planning details: " + JSON.stringify(Object.fromEntries(
      ["purpose", "environment", "surroundings", "architecture", "layout", "lighting", "cameras", "visualStyle", "contentType"].filter(k => k in b).map(k => [k, b[k]]))) });
}
export function locationRequestId(task: string, key: string) {
  const h = v3Digest("location-request", { task, key });
  return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;
}
export function locationStageLabel(phase: string) {
  return ({ plan: "Planning Location", sheet: "Generating Location sheet", publish: "Saving Location", complete: "Location ready for review",
    check: "Saving generated Location", repair: "Saving generated Location", recheck: "Saving generated Location" } as Record<string,string>)[phase] ?? "Preparing Location";
}
