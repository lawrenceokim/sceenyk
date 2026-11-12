import { unstable_rethrow } from "next/navigation";
import type { ReactNode } from "react";
import { resolveDetailVideo, type DetailVideoKind } from "@/lib/media/detail-video-server";
import { ApprovedVideoPlayer } from "./approved-video-player";

export async function DetailVideoPreview({ kind, id, children }: { kind: DetailVideoKind; id: string; children: ReactNode }) {
  let version: string | undefined;
  try {
    const resolved = await resolveDetailVideo(kind, id);
    if (resolved && await resolved.stillAllowed()) version = resolved.video.version;
  } catch (error) { unstable_rethrow(error); /* Keep the original static preview on an unavailable read. */ }
  if (version) return <ApprovedVideoPlayer label="Approved final video" className="aspect-square w-full"
    src={`/api/detail-video?${new URLSearchParams({ kind, id, version })}`}>{children}</ApprovedVideoPlayer>;
  return children;
}
