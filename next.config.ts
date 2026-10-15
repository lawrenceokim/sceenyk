import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // PPR can resume a cached shell with request-specific content. Cover its
    // generated response paths too: /profile/:path* does not match /profile.rsc.
    return [
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
