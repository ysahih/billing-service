import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Stripe SDK must only ever run on the server.
  serverExternalPackages: ["stripe"],
};

export default nextConfig;
