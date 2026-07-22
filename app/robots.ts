import type { MetadataRoute } from 'next'
import { getSiteMetadataBase } from '@/lib/site-metadata'

export default function robots(): MetadataRoute.Robots {
  const base = getSiteMetadataBase().origin
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/admin/', '/api/'],
    },
    sitemap: `${base}/sitemap.xml`,
  }
}
