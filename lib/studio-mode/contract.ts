import { z } from "zod";

// Presentation metadata only. Never add this to creative/generation snapshots.
export const studioModeSchema = z.enum(["basic", "pro"]);
export type StudioMode = z.infer<typeof studioModeSchema>;
export const defaultStudioMode: StudioMode = "basic";
export const studioModeInputSchema = z.strictObject({
  projectId: z.uuid().nullable(),
  mode: studioModeSchema,
});
export const studioModeStateSchema = z.strictObject({
  preferredMode: studioModeSchema,
  projectMode: studioModeSchema.nullable(),
});
export type StudioModeState = z.infer<typeof studioModeStateSchema>;
export type StudioModeResult =
  | { ok: true; data: StudioModeState & { clerkUserId: string } }
  | { ok: false; message: string };

export function studioModeLabel(mode: StudioMode) {
  return mode === "pro" ? "Pro" : "Basic";
}

// M1 has no incompatible features. Later feature owners supply actual limits;
// hiding controls must never detach references, erase data or start paid work.
export function needsBasicConfirmation(from: StudioMode, to: StudioMode, incompatibleFeatures: readonly string[]) {
  return from === "pro" && to === "basic" && incompatibleFeatures.length > 0;
}
