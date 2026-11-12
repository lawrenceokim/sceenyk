import { z } from "zod";

export const previewJobSchema = z.object({
  id: z.uuid(), owner_user_id: z.uuid(), project_id: z.uuid(), version: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(["queued", "processing", "ready", "failed"]), lease_token: z.uuid().nullable(),
  etag: z.string().nullable(), size_bytes: z.number().int().nullable(),
});
export type PreviewJob = z.infer<typeof previewJobSchema>;
export type PreviewReply = { state: "pending" | "unavailable" } | { state: "ready"; url: string; expiresAt: string; version: string };

export function projectPreviewKey(job: Pick<PreviewJob, "owner_user_id" | "project_id" | "version">) {
  z.uuid().parse(job.owner_user_id); z.uuid().parse(job.project_id);
  z.string().regex(/^[a-f0-9]{64}$/).parse(job.version);
  return `users/${job.owner_user_id}/projects/${job.project_id}/project-previews/${job.version}.mp4`;
}
