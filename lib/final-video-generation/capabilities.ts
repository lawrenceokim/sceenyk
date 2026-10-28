import { FinalVideoError } from "./contract";

export type CapabilityLayer = "video" | "voice" | "lip_sync" | "composition" | "funding";
export type CapabilityIssue = { layer: CapabilityLayer; code: string; message: string; sceneNumber?: number;
  requestedTransition?: string; supportedTransitions?: readonly string[] };
export class FinalPreflightError extends FinalVideoError {
  constructor(readonly diagnostics: readonly CapabilityIssue[]) { super("FINAL_CAPABILITY", 422); }
}
