import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Next forwards query parameters; the HTTP redirect also retains fragments.
    return [
      { source: "/create", destination: "/studio", permanent: true },
      { source: "/settings/earnings", destination: "/credits/earnings", permanent: true },
      { source: "/dashboard/settings/earnings", destination: "/credits/earnings", permanent: true },
      { source: "/settings/credits", destination: "/credits", permanent: true },
      { source: "/dashboard/settings/credits", destination: "/credits", permanent: true },
      { source: "/settings", destination: "/settings/account", permanent: true },
      { source: "/dashboard", has: [{ type: "query", key: "page" }], destination: "/projects", permanent: true },
      { source: "/dashboard", destination: "/studio", permanent: true },
      { source: "/dashboard/credits", destination: "/credits", permanent: true },
      { source: "/dashboard/marketplace/profile", destination: "/settings/creator-profile", permanent: true },
      { source: "/dashboard/marketplace/earnings", destination: "/credits/earnings", permanent: true },
      { source: "/dashboard/marketplace/purchases", destination: "/marketplace/purchases", permanent: true },
      { source: "/dashboard/marketplace/:path*", destination: "/settings/templates/:path*", permanent: true },
      { source: "/dashboard/:path+", destination: "/:path+", permanent: true },
    ];
  },
  async headers() {
    // PPR can resume a cached shell with request-specific content. Cover its
    // generated response paths too: /profile/:path* does not match /profile.rsc.
    return [
      ...["/settings", "/credits", "/templates", "/projects", "/marketplace/purchases"].flatMap(base => [
        `${base}/:path*`, `${base}.html`, `${base}.rsc`,
        `${base}.prefetch.rsc`, `${base}.segments/:path*`,
      ]),
      "/admin/:path*",
      "/api/admin/:path*",
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
