import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// Scripts allow 'unsafe-inline' because Next.js inlines its own bootstrap
// scripts and this app does not use nonces. Nonces need src/proxy.ts and make
// every page dynamically rendered. The TradingView widgets load a script from
// s3.tradingview.com and render inside TradingView iframes.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${
    isDev ? " 'unsafe-eval'" : ""
  } https://s3.tradingview.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src https://*.tradingview.com https://*.tradingview-widget.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  compiler: {
    // Keep errors and warnings in production so failures leave a trace
    removeConsole:
      process.env.NODE_ENV === "production"
        ? { exclude: ["error", "warn"] }
        : false,
  },
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
