import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/dashboard/subscription',
        destination: '/dashboard/assinatura',
        permanent: true,
      },
    ]
  },
  turbopack: {
    root: path.join(__dirname),
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default nextConfig
