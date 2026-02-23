import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // pnpm on Windows creates symlinks that webpack resolves through two
    // different path casings (Desktop vs desktop), loading the same module
    // twice and breaking React's hook invariant.  Disabling symlink
    // resolution forces all imports to use the symlink path consistently.
    config.resolve.symlinks = false;
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL ?? "http://localhost:4000"}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
