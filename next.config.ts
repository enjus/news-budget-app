import type { NextConfig } from "next";

// basePath lets the app be served under a subpath (e.g. "/news-budget").
// Set BASE_PATH in the environment; defaults to "" (domain-root deployment).
// NEXT_PUBLIC_BASE_PATH (below) mirrors this for client-side fetch calls via apiPath().
const basePath = process.env.BASE_PATH ?? "";

const nextConfig: NextConfig = {
  basePath,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-XSS-Protection", value: "1; mode=block" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
