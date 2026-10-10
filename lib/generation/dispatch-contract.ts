import { z } from "zod";

export const generationRequested = "sceenyk/generation.requested";
export const generationEventSchema = z.strictObject({
  generationJobId: z.uuid(),
});
export const dispatchStatuses = [
  "pending",
  "dispatched",
  "claimed",
  "dispatch_failed",
] as const;
export type DispatchStatus = (typeof dispatchStatuses)[number];
