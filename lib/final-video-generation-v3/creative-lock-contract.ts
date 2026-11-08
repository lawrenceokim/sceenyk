import { z } from "zod";

export const creativeLockRowSchema = z.object({ id: z.uuid(), project_id: z.uuid(), owner_user_id: z.uuid(), revision: z.number().int().positive(),
  package_id: z.uuid().nullable(), first_run_id: z.uuid().nullable(), state: z.enum(["locked", "needs_review"]),
  document: z.record(z.string(), z.unknown()), snapshot_hash: z.string().regex(/^[a-f0-9]{64}$/), captured_at: z.string(),
  origin: z.enum(["first_clip", "historical_recovery"]), valid: z.boolean() });
export const lockedBriefSchema = z.object({ id: z.uuid(), title: z.string(), prompt: z.string(), aspect_ratio: z.string(), duration: z.string(),
  visual_style: z.string(), tone: z.string(), category: z.string(), ugc_type: z.string(), creation_type: z.string(), video_resolution: z.string() });
export type LockedBrief = z.infer<typeof lockedBriefSchema>;
export type CreativeLockSummary = { state: "locked" | "needs_review" | "damaged" | "setup_required"; packageId: string | null;
  capturedAt: string | null; firstApprovedAt: string | null; brief?: LockedBrief; originalIds: string[]; originalNames?: Record<string, string>; referenceIds: string[] };
export const creativeMutationActions = new Set(["reference", "cleanup_references", "discard_reference", "location_continue", "review_artifact", "storyboard", "build_package", "authorize"]);
