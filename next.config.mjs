/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? '',
  experimental: {
    serverComponentsExternalPackages: ['@arcasdk/core', '@arcasdk/pdf', 'drizzle-orm', 'postgres'],
    outputFileTracingExcludes: {
      '*': ['./node_modules/**/*'],
    },
  },
}

export default nextConfig
