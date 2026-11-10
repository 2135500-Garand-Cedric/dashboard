import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Search query strings can contain private finance descriptions or work/contact details.
  logging: { incomingRequests: { ignore: [/^\/(?:api\/)?finance(?:[/?]|$)/, /^\/(?:api\/)?todos(?:[/?]|$)/, /^\/api\/work-(?:items|contacts|contexts)(?:[/?]|$)/] } },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
