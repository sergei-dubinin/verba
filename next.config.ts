import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // e2e собирает приложение в свой каталог, чтобы не мешать pnpm dev.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
