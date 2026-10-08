import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // DB-backed pages are rendered per request; disable build-time prerender caching.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains", condition: "has(request.header, 'x-forwarded-proto') && request.header['x-forwarded-proto'] == 'https'" },
        ],
      },
    ];
  },
};

export default nextConfig;
