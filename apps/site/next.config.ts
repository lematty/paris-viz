import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // www.parisviz.com is canonical: fold the legacy vercel.app host into
    // it so search engines see a single domain. Host-scoped, so localhost
    // and preview deployments are untouched.
    const hosts = ["paris-viz.vercel.app"];
    return hosts.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://www.parisviz.com/:path*",
      permanent: true,
    }));
  },
};

export default nextConfig;
