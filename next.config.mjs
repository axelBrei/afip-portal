/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['@arcasdk/core', '@arcasdk/pdf'],
  },
}

export default nextConfig
