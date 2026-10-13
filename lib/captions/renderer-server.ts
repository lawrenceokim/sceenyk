import "server-only";
import { z } from "zod";
import { createDatabaseClient } from "@/lib/db/server";
import { captionSourceSchema, captionTrackSchema, validateCaptionSource } from "./contract";
import { captionStyleSelectionSchema, defaultCaptionStyleSelection } from "./style";
import { serializeRendererCaptions } from "./renderer-payload";

// Internal service-role reader for a future renderer. No public route or render claim.
export async function readRendererCaptionPayload(jobId: string) {
  z.uuid().parse(jobId);
  const db = createDatabaseClient();
  const trackRow = await db.from("caption_tracks").select("job_id,owner_user_id,project_id,track")
    .eq("job_id", jobId).maybeSingle();
  if (trackRow.error) throw new Error("CAPTION_HANDOFF_UNAVAILABLE");
  if (!trackRow.data) return null;
  const [composition, preference, source] = await Promise.all([
    db.from("composition_plans").select("owner_user_id,project_id,status,plan")
      .eq("job_id", jobId).eq("owner_user_id", trackRow.data.owner_user_id)
      .eq("project_id", trackRow.data.project_id).maybeSingle(),
    db.from("caption_preferences").select("enabled,style")
      .eq("job_id", jobId).eq("owner_user_id", trackRow.data.owner_user_id)
      .eq("project_id", trackRow.data.project_id).maybeSingle(),
    db.rpc("caption_source", { p_job_id: jobId }),
  ]);
  if (composition.error || preference.error || source.error || !composition.data || !source.data)
    throw new Error("CAPTION_HANDOFF_UNAVAILABLE");
  const track = captionTrackSchema.parse(trackRow.data.track);
  const trustedSource = captionSourceSchema.parse(source.data);
  validateCaptionSource(track, trustedSource);
  return serializeRendererCaptions({ track, plan: trustedSource.plan,
    style: preference.data ? captionStyleSelectionSchema.parse(preference.data.style) : defaultCaptionStyleSelection,
    enabled: preference.data?.enabled ?? true });
}
