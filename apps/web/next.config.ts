import type { NextConfig } from "next";

// CSP needs per-request nonces (proxy.ts), which only pays off once Turnstile
// and Google sign-in land in Phase 1. The static headers below apply now.
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-Frame-Options", value: "DENY" },
];

const config: NextConfig = {
  reactCompiler: true,
  cacheComponents: true,
  poweredByHeader: false,
  transpilePackages: ["@gamehub/ui", "@gamehub/engine", "@gamehub/protocol"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default config;
