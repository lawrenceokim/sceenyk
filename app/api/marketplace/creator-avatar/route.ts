import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { uploadCreatorAvatar } from "@/lib/marketplace/creators/avatar";
import { CreatorProfileError } from "@/lib/marketplace/creators/server";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ ok: false, message: "This request is unavailable." }, { status: 403, headers });
  try {
    const profile = await uploadCreatorAvatar(request);
    revalidatePath("/marketplace", "layout");
    revalidatePath("/dashboard/marketplace/profile");
    return Response.json({ ok: true, profile }, { headers });
  }
  catch (error) {
    unstable_rethrow(error);
    return Response.json({ ok: false, message: error instanceof CreatorProfileError ? error.message : "Your avatar couldn’t be saved. Please try again." }, { status: error instanceof CreatorProfileError && error.code !== "UNAVAILABLE" ? 400 : 503, headers });
  }
}
