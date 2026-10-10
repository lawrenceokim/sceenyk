import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  NextResponse,
  type NextRequest,
  type NextFetchEvent,
} from "next/server";
import { getClerkDevelopmentConfig } from "@/lib/auth/config";

const withClerk = clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  if (isPrivatePath(path)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/?auth=sign-in", request.url).toString(),
    });
  }
});

function isPrivatePath(path: string) {
  return (
    path === "/dashboard" ||
    path.startsWith("/dashboard/") ||
    path === "/projects" ||
    path.startsWith("/projects/")
  );
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Worker requests use the official Inngest signature gate, independent of
  // browser sessions and Clerk availability. No other API bypass is added.
  if (request.nextUrl.pathname === "/api/inngest") return NextResponse.next();
  if (!getClerkDevelopmentConfig().enabled) {
    const path = request.nextUrl.pathname;
    if (isPrivatePath(path)) {
      return NextResponse.redirect(new URL("/?auth=sign-in", request.url));
    }
    return NextResponse.next();
  }
  // Clerk validates the session here; server rendering checks it again.
  return withClerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/dashboard/:path*",
    "/projects/:path*",
    "/(api|trpc)(.*)",
  ],
};
