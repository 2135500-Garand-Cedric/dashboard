import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Finance query strings may include private descriptions and merchant searches.
  logging: { incomingRequests: { ignore: [/^\/(?:api\/)?finance(?:[/?]|$)/] } },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
