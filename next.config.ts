import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // PPR can resume a cached shell with request-specific content. Cover its
    // generated response paths too: /profile/:path* does not match /profile.rsc.
    return [
      "/dashboard/settings/:path*",
      "/dashboard/settings.html",
      "/dashboard/settings.rsc",
      "/dashboard/settings.prefetch.rsc",
      "/dashboard/settings.segments/:path*",
      // Keep the financial account and each emitted resource explicitly
      // private as well as applying the general Settings policy above.
      "/dashboard/settings/credits/:path*",
      "/dashboard/settings/credits.html",
      "/dashboard/settings/credits.rsc",
      "/dashboard/settings/credits.prefetch.rsc",
      "/dashboard/settings/credits.segments/:path*",
      "/settings/:path*",
      "/settings.html",
      "/settings.rsc",
      "/settings.prefetch.rsc",
      "/settings.segments/:path*",
      "/admin/:path*",
      "/api/admin/:path*",
      "/dashboard/marketplace/profile/:path*",
      "/dashboard/marketplace/profile.html",
      "/dashboard/marketplace/profile.rsc",
      "/dashboard/marketplace/profile.prefetch.rsc",
      "/dashboard/marketplace/profile.segments/:path*",
      "/api/marketplace/creator-avatar",
    ].map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "private, no-cache, no-store, max-age=0, must-revalidate" },
        { key: "CDN-Cache-Control", value: "no-store" },
        { key: "Vercel-CDN-Cache-Control", value: "no-store" },
      ],
    }));
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
