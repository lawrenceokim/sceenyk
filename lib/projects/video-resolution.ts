import { z } from "zod";

export const videoResolutions = ["480p", "720p", "1080p"] as const;
export const defaultVideoResolution = "480p" as const;
export const videoResolutionSchema = z.enum(videoResolutions);
export type VideoResolution = z.infer<typeof videoResolutionSchema>;
// Missing settings belong to older projects; invalid supplied values still fail.
export const projectVideoResolution = (value: unknown): VideoResolution =>
  videoResolutionSchema.default(defaultVideoResolution).parse(value);
