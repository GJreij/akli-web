import type { NextConfig } from "next";

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.10.66", "172.20.10.2"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "rjaypqibeymfopncjxkz.supabase.co",
      },
    ],
  },
};

module.exports = withPWA(nextConfig);
