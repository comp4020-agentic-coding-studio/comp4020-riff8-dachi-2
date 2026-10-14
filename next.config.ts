import type { NextConfig } from "next";

// Static export: the game server (server/main.ts) serves out/ and owns the
// simulation. Next.js is the app shell and never runs a request handler.
const config: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default config;
