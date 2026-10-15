import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    // Internal HTML/RSC and APIs must remain private even when their empty
    // Cache Components shells are prerendered. Cover browser and CDN caches.
    return ["/admin/:path*", "/api/admin/:path*", "/dashboard/marketplace/profile/:path*", "/api/marketplace/creator-avatar"].map((source) => ({
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
