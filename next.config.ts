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
      { source: '/entrar', destination: '/login', permanent: true },
      { source: '/signin', destination: '/login', permanent: true },
      { source: '/sign-in', destination: '/login', permanent: true },
      { source: '/recuperar-senha', destination: '/login/recuperar', permanent: true },
      { source: '/redefinir-senha', destination: '/login/redefinir-senha', permanent: true },
      { source: '/cadastro', destination: '/register', permanent: true },
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
