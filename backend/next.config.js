/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CORS headers are handled by middleware.ts
  // Removing duplicate CORS config from here to avoid conflicts
};

module.exports = nextConfig;

