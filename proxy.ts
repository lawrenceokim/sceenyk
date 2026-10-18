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
  if (path === "/dashboard") {
    // Redirect before streaming: an HTTP redirect preserves legacy fragments
    // that never reach the server, unlike a streamed page redirect.
    const page = request.nextUrl.searchParams.get("page");
    const target = new URL(page === null ? "/create" : "/dashboard/projects", request.url);
    if (page !== null) target.searchParams.set("page", page);
    return NextResponse.redirect(target);
  }
  if (isCreatorProfileResponsePath(path) || path === "/dashboard/settings" || path.startsWith("/dashboard/settings/") || path.startsWith("/dashboard/settings.") || path === "/settings" || path.startsWith("/settings.")) {
    // Deployment routing may present the generated RSC/segment pathname.
    // Keep its response policy identical to the authenticated HTML route.
    const response = NextResponse.next();
    response.headers.set("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate");
    response.headers.set("CDN-Cache-Control", "no-store");
    response.headers.set("Vercel-CDN-Cache-Control", "no-store");
    return response;
  }
});

function isCreatorProfileResponsePath(path: string) {
  const base = "/dashboard/marketplace/profile";
  return path === base || path.startsWith(`${base}/`) ||
    path.startsWith(`${base}.segments/`) ||
    [".html", ".rsc", ".prefetch.rsc"].some((suffix) => path === base + suffix);
}

function isPrivatePath(path: string) {
  return (
    path === "/settings" || path.startsWith("/settings.") ||
    path === "/dashboard" ||
    path.startsWith("/dashboard/") ||
    path === "/projects" ||
    path.startsWith("/projects/")
  );
}

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  // Service callbacks verify their own signatures, independent of browser
  // sessions. PayPal postback verification is mandatory inside its handler.
  if (["/api/inngest", "/api/payments/paypal/webhook"].includes(request.nextUrl.pathname)) return NextResponse.next();
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
