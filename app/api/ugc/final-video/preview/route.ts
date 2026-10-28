import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { ownedFinalExecution } from "@/lib/final-video-generation/server";
import { headR2CharacterObject, signR2Read } from "@/lib/storage/r2";
import { finalPrefix } from "@/lib/final-video-generation/storage";

const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", Vary: "Cookie",
  "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export async function GET(request: Request) {
  try {
    const input = z.strictObject({ projectId: z.uuid(), jobId: z.uuid(), executionId: z.uuid() }).parse(Object.fromEntries(new URL(request.url).searchParams));
    const { execution } = await ownedFinalExecution(input);
    const asset = execution.final_asset;
    if (!asset || !["review", "approved"].includes(execution.state) || !asset.key.startsWith(finalPrefix(execution))) throw new Error();
    const object = await headR2CharacterObject(asset.key, AbortSignal.timeout(15_000));
    if (!object || object.etag !== asset.etag || object.sizeBytes !== asset.sizeBytes || object.mimeType !== asset.mimeType) throw new Error();
    const signed = await signR2Read(asset.key, asset.etag, asset.mimeType);
    return new Response(null, { status: 303, headers: { ...headers, Location: signed.url } });
  } catch (error) { unstable_rethrow(error); return new Response("Video unavailable", { status: 404, headers }); }
}
