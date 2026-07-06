/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@arcasdk/core', '@arcasdk/pdf', 'drizzle-orm', 'postgres'],
  },
}

export default nextConfig
