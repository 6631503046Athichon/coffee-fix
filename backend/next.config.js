const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  compress: true,
  outputFileTracingRoot: path.join(__dirname),
  // CORS headers are handled by middleware.ts
  // Removing duplicate CORS config from here to avoid conflicts
};

module.exports = nextConfig;

