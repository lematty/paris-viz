import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // parisviz.com is canonical: fold the legacy vercel.app host and www
    // into it so search engines see a single domain. Host-scoped, so
    // localhost and preview deployments are untouched.
    const hosts = ["paris-viz.vercel.app", "www.parisviz.com"];
    return hosts.map((host) => ({
      source: "/:path*",
      has: [{ type: "host" as const, value: host }],
      destination: "https://parisviz.com/:path*",
      permanent: true,
    }));
  },
};

export default nextConfig;
