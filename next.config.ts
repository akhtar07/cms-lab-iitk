import type { NextConfig } from "next";

// GitHub Pages serves project sites under /<repo-name>/. The deploy workflow
// sets NEXT_PUBLIC_BASE_PATH to that; locally it is empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
