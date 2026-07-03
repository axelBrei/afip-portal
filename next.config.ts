import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@arcasdk/core', '@arcasdk/pdf'],
}

export default nextConfig
