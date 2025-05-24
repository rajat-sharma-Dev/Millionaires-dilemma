/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    config.externals.push("pino-pretty");
    return config;
  },
  eslint: {
    // This allows production builds to complete even with ESLint warnings
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
