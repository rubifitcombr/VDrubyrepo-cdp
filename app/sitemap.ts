import type { MetadataRoute } from 'next'
import { getSiteMetadataBase } from '@/lib/site-metadata'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteMetadataBase().origin
  const now = new Date()
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/register`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/blog`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${base}/termos`, lastModified: now, changeFrequency: 'yearly', priority: 0.4 },
  ]
}
