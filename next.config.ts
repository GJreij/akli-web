import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.10.66", "172.20.10.2", "192.168.1.95"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rjaypqibeymfopncjxkz.supabase.co",
      },
    ],
  },
  // Dev-only: the project lives under OneDrive, whose sync agent holds
  // real, sustained locks on files inside .next while webpack writes them
  // (confirmed via repeated EBUSY on .next/server/*.js during dev). That
  // collision can crash Node's native filesystem watcher on Windows
  // (`Assertion failed: !_wcsnicmp(...)`, src\win\fs-event.c). Polling
  // instead of native OS file-change events sidesteps that native watcher.
  // (Relocating distDir outside the OneDrive tree was tried and reverted —
  // it breaks Node's node_modules resolution for the generated bundles,
  // which require() their way up from wherever .next physically lives.)
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = { poll: 1000, aggregateTimeout: 300 };
    }
    return config;
  },
};

module.exports = withPWA(nextConfig);
