import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { readAppUser } from "@/lib/auth/read-app-user";
import { resolveTemplatePublishMedia, publishMediaVariant } from "@/lib/marketplace/publish-media";
import { privateMediaResponse, privateMediaHeaders as headers } from "@/lib/media/private-media-response";

const input = z.strictObject({ listing: z.uuid(), version: z.string().regex(/^[a-f0-9]{64}$/), variant: publishMediaVariant });
export async function GET(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site" || request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin)
    return new Response("Preview unavailable", { status: 403, headers });
  try {
    const query = input.parse(Object.fromEntries(new URL(request.url).searchParams)), user = await readAppUser();
    const media = await resolveTemplatePublishMedia(user.id, query.listing, query.variant);
    if (!media || media.version !== query.version) return new Response("Preview unavailable", { status: 404, headers });
    return await privateMediaResponse(request, media, media.stillAllowed);
  } catch (error) { unstable_rethrow(error); return new Response("Preview unavailable", { status: 404, headers }); }
}
