import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  // This ensures static exports work correctly
  images: {
    unoptimized: true
  }
};

export default nextConfig;
