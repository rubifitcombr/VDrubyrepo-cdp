import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  serverExternalPackages: ['node-cron'],
  compiler: {
    removeConsole:
      process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },
  async redirects() {
    return [
      {
        source: '/dashboard/subscription',
        destination: '/dashboard/assinatura',
        permanent: true,
      },
      { source: '/entrar', destination: '/login', permanent: true },
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/sign-in', destination: '/login', permanent: true },
      { source: '/recuperar-senha', destination: '/login/recuperar', permanent: true },
      { source: '/redefinir-senha', destination: '/login/redefinir-senha', permanent: true },
      { source: '/cadastro', destination: '/register', permanent: true },
      {
        source: '/dashboard/master/recuperador',
        destination: '/dashboard/master/marketing',
        permanent: true,
      },
      {
        source: '/dashboard/master/recuperador/:path*',
        destination: '/dashboard/master/marketing',
        permanent: true,
      },
    ]
  },
  async rewrites() {
    return [{ source: '/planos', destination: '/dashboard/planos' }]
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
      {
        protocol: 'https',
        hostname: '**.supabase.in',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
}

export default nextConfig
