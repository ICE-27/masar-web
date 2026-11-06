import type { NextConfig } from "next";

/**
 * STATIC_EXPORT=1 produces a folder of plain HTML in ./out, used for the
 * shareable preview. A normal build runs as a full Next app on Vercel.
 */
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  output: isStaticExport ? "export" : undefined,
  images: { unoptimized: isStaticExport },
  trailingSlash: isStaticExport,
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
