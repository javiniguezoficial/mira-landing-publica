import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  // Needed for framer-motion with Next.js App Router
  transpilePackages: ['framer-motion'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'entornodev.com',
      },
      {
        protocol: 'https',
        hostname: 'grainy-gradients.vercel.app',
      },
    ],
  },
  // Redirect /signup → /registro (compatibility)
  async redirects() {
    return [
      {
        source: '/signup',
        destination: '/registro',
        permanent: true,
      },
    ]
  },
}

export default nextConfig
