import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // Static export so the frontend can be hosted on Cloudflare Pages (or any
  // static host). The app is fully client-side — no API routes, no SSR-required
  // imports — so this builds clean.
  output: "export",
  // Image optimizer requires a Node.js runtime; off for static export.
  images: { unoptimized: true },
  // Trailing slashes generate `/route/index.html` which static hosts serve
  // without rewrite rules (Cloudflare Pages, GitHub Pages, S3 all happy).
  trailingSlash: true,
};

export default config;
