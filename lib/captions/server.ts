import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { generationReferenceSchema } from "@/lib/generation/validation";
import { captionSourceSchema, captionTrackSchema, validateCaptionSource } from "./contract";
import { buildCaptionTrack } from "./build";
import { z } from "zod";

export async function buildOrReuseCaptions(jobId: string) {
  z.uuid().parse(jobId);
  const db = createDatabaseClient();
  const existing = await db.from("caption_tracks").select("id,track").eq("job_id", jobId).maybeSingle();
  if (existing.error) throw new Error("CAPTIONS_UNAVAILABLE");
  if (existing.data) {
    const track = captionTrackSchema.parse(existing.data.track);
    const source = await db.rpc("caption_source", { p_job_id: jobId });
    if (source.error || !source.data) throw new Error("CAPTIONS_UNAVAILABLE");
    validateCaptionSource(track, captionSourceSchema.parse(source.data));
    return existing.data.id;
  }
  const result = await db.rpc("caption_source", { p_job_id: jobId });
  if (result.error) throw new Error("CAPTIONS_UNAVAILABLE");
  if (!result.data) return null;
  const source = captionSourceSchema.parse(result.data), track = buildCaptionTrack(source);
  const saved = await db.rpc("persist_caption_track", { p_job_id: jobId, p_track: track });
  if (saved.error || !saved.data) throw new Error("CAPTIONS_UNAVAILABLE");
  return saved.data;
}

async function ownedReference(input: unknown) {
  const user = await ensureAppUser(), ref = generationReferenceSchema.safeParse(input);
  if (!ref.success) return null;
  const db = createDatabaseClient();
  const job = await db.from("generation_jobs").select("id").eq("id", ref.data.jobId)
    .eq("project_id", ref.data.projectId).eq("owner_user_id", user.id).maybeSingle();
  const project = await db.from("projects").select("id").eq("id", ref.data.projectId).eq("owner_user_id", user.id).maybeSingle();
  if (job.error || project.error) throw new Error("CAPTIONS_UNAVAILABLE");
  return job.data && project.data ? { ...ref.data, ownerId: user.id } : null;
}

export async function getOwnedCaptions(input: unknown) {
  const ref = await ownedReference(input);
  if (!ref) return null;
  const db = createDatabaseClient();
  const result = await db.from("caption_tracks").select("id,track").eq("job_id", ref.jobId)
    .eq("project_id", ref.projectId).eq("owner_user_id", ref.ownerId).maybeSingle();
  const preference = await db.from("caption_preferences").select("enabled").eq("job_id", ref.jobId)
    .eq("project_id", ref.projectId).eq("owner_user_id", ref.ownerId).maybeSingle();
  if (result.error || preference.error) throw new Error("CAPTIONS_UNAVAILABLE");
  if (!result.data) return { id: null, track: null, enabled: preference.data?.enabled ?? true };
  const track = captionTrackSchema.parse(result.data.track);
  const source = await db.rpc("caption_source", { p_job_id: ref.jobId });
  if (source.error || !source.data) throw new Error("CAPTIONS_UNAVAILABLE");
  validateCaptionSource(track, captionSourceSchema.parse(source.data));
  return { id: result.data.id, track, enabled: preference.data?.enabled ?? true };
}

export async function setOwnedCaptionPreference(input: unknown) {
  const parsed = generationReferenceSchema.extend({ enabled: z.boolean() }).strict().safeParse(input);
  if (!parsed.success) return false;
  const ref = await ownedReference({ projectId: parsed.data.projectId, jobId: parsed.data.jobId });
  if (!ref) return false;
  const result = await createDatabaseClient().rpc("set_caption_preference", {
    p_owner_user_id: ref.ownerId, p_project_id: ref.projectId, p_job_id: ref.jobId, p_enabled: parsed.data.enabled,
  });
  if (result.error) throw new Error("CAPTIONS_UNAVAILABLE");
  return result.data;
}
