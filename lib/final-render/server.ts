import "server-only";
import { ensureAppUser } from "@/lib/auth/ensure-app-user";
import { createDatabaseClient } from "@/lib/db/server";
import { generationReferenceSchema } from "@/lib/generation/validation";
import { inspectR2Object, signR2Read } from "@/lib/storage/r2";

export async function getOwnedFinalVideo(input:unknown){
  const user=await ensureAppUser(),ref=generationReferenceSchema.safeParse(input);if(!ref.success)return null;
  const db=createDatabaseClient();
  const project=await db.from("projects").select("id").eq("id",ref.data.projectId).eq("owner_user_id",user.id).eq("status","draft").maybeSingle();
  if(project.error)throw new Error("FINAL_VIDEO_UNAVAILABLE");if(!project.data)return null;
  const job=await db.from("generation_jobs").select("id,status").eq("id",ref.data.jobId).eq("project_id",ref.data.projectId).eq("owner_user_id",user.id).maybeSingle();
  if(job.error)throw new Error("FINAL_VIDEO_UNAVAILABLE");if(job.data?.status!=="completed")return null;
  const result=await db.from("final_video_assets").select("*").eq("generation_job_id",ref.data.jobId).eq("owner_user_id",user.id).eq("project_id",ref.data.projectId).maybeSingle();
  if(result.error)throw new Error("FINAL_VIDEO_UNAVAILABLE");if(!result.data)return null;const a=result.data;
  const expected=`users/${user.id}/generations/${ref.data.jobId}/result.mp4`;
  if(a.storage_key!==expected||a.mime_type!=="video/mp4")throw new Error("FINAL_VIDEO_UNAVAILABLE");
  const stored=await inspectR2Object(expected);
  if(!stored||stored.etag!==a.verified_etag||stored.sizeBytes!==a.size_bytes||stored.mimeType!==a.mime_type)throw new Error("FINAL_VIDEO_UNAVAILABLE");
  const preview=await signR2Read(expected,a.verified_etag,a.mime_type),download=await signR2Read(expected,a.verified_etag,a.mime_type,true);
  return {id:a.id,durationMs:a.duration_ms,sizeBytes:a.size_bytes,width:a.width,height:a.height,fps:a.fps,url:preview.url,expiresAt:preview.expiresAt,downloadUrl:download.url};
}
