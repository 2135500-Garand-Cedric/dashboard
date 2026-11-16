import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Search query strings can contain private finance descriptions or work/contact details.
  logging: {
    incomingRequests: {
      ignore: [
        /^\/(?:api\/)?(?:finance|projects|my-work)(?:[/?]|$)/,
        /^\/(?:api\/)?todos(?:[/?]|$)/,
        /^\/api\/work-(?:items|contacts|contexts)(?:[/?]|$)/,
      ],
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ];
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
