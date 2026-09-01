import type { NextConfig } from "next";

const isDockerBuild = process.env.DOCKER_BUILD === "1";

const nextConfig: NextConfig = {
  // "standalone" is only needed for the Docker image. Vercel runs its own
  // serverless build pipeline, so we must NOT emit a standalone server there
  // (it caused a missing next-server.js.nft.json on Vercel).
  output: isDockerBuild ? "standalone" : undefined,
  devIndicators: false,
};

export default nextConfig;
