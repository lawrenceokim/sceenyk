import "server-only";
import { z } from "zod";
import { readAppUser } from "@/lib/auth/read-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { signR2Read } from "@/lib/storage/r2";
import { resolveApprovedProjectVideo } from "./approved-video";
import { previewJobSchema, projectPreviewKey, type PreviewReply } from "./video-preview-contract";
import { readPrivate } from "@/lib/final-video-generation-v3/runtime-media";
import { projectMediaLifetimeMs, type ProjectMediaReply } from "./cached-media-contract";

async function ownedPreview(project: unknown) {
  const projectId = z.uuid().parse(project), user = await readAppUser();
  const video = await resolveApprovedProjectVideo(user.id, projectId);
  if (!video) return null;
  const result = await createDatabaseClient().rpc("project_video_preview_request", {
    p_owner: user.id, p_project: projectId, p_version: video.version,
  });
  if (result.error) throw new Error("PROJECT_PREVIEW_SETUP_REQUIRED");
  const job = previewJobSchema.parse(result.data);
  if (job.owner_user_id !== user.id || job.project_id !== projectId || job.version !== video.version) throw new Error("PROJECT_PREVIEW_SCOPE");
  return job;
}

export async function readOwnedProjectVideoPreview(project: unknown): Promise<PreviewReply> {
  const job = await ownedPreview(project);
  if (!job || job.state === "failed") return { state: "unavailable" };
  if (job.state !== "ready" || !job.etag) return { state: "pending" };
  return { state: "ready", version: job.version, ...await signR2Read(projectPreviewKey(job), job.etag, "video/mp4") };
}

export async function readOwnedProjectVideoPreviewMedia(project: unknown, knownVersion?: string): Promise<ProjectMediaReply> {
  const job = await ownedPreview(project);
  if (!job || job.state === "failed") return { state: "unavailable" };
  if (job.state !== "ready" || !job.etag || !job.size_bytes) return { state: "pending" };
  const reply = { state: "ready" as const, version: job.version, expiresAt: new Date(Date.now() + projectMediaLifetimeMs).toISOString() };
  if (knownVersion === job.version) return reply;
  if (job.size_bytes > 2 * 1024 * 1024) throw new Error("PROJECT_PREVIEW_SIZE");
  return { ...reply, mimeType: "video/mp4", bytes: await readPrivate(projectPreviewKey(job), job.etag, job.size_bytes, AbortSignal.timeout(30_000)) };
}
