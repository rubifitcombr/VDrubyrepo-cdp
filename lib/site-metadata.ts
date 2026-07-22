import type { Metadata } from 'next'

const SITE_NAME = 'Vyria Delivery'
const SITE_DESCRIPTION =
  'Engenharia de vendas local — gestão de entregas, cardápio digital e painel para restaurantes.'

function normalizeSiteOrigin(raw: string | undefined): URL | undefined {
  const trimmed = String(raw ?? '').trim().replace(/\/+$/, '')
  if (!trimmed) return undefined
  try {
    if (/^https?:\/\//i.test(trimmed)) return new URL(trimmed)
    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
      return new URL(`http://${trimmed}`)
    }
    return new URL(`https://${trimmed}`)
  } catch {
    return undefined
  }
}

/** Origem pública para metadados (OG, favicon absoluto, JSON-LD). */
export function getSiteMetadataBase(): URL {
  return (
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL) ??
    normalizeSiteOrigin(process.env.VYRIA_PUBLIC_URL) ??
    new URL('https://acesso.vyriadelivery.com.br')
  )
}

export function getSiteOpenGraphImageUrl(): string {
  return `${getSiteMetadataBase().origin}/icons/icon-512x512.png`
}

export function buildRootSiteMetadata(): Metadata {
  const metadataBase = getSiteMetadataBase()
  const ogImage = getSiteOpenGraphImageUrl()

  return {
    metadataBase,
    title: {
      default: SITE_NAME,
      template: `%s · ${SITE_NAME}`,
    },
    description: SITE_DESCRIPTION,
    applicationName: SITE_NAME,
    manifest: '/manifest.json',
    alternates: {
      canonical: '/',
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Vyria',
    },
    icons: {
      icon: [
        { url: '/icon.png', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icons/icon-48x48.png', sizes: '48x48', type: 'image/png' },
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      ],
      shortcut: ['/favicon-32x32.png'],
    },
    openGraph: {
      type: 'website',
      locale: 'pt_BR',
      url: metadataBase.origin,
      siteName: SITE_NAME,
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [
        {
          url: ogImage,
          width: 512,
          height: 512,
          alt: 'Logo Vyria Delivery',
          type: 'image/png',
        },
      ],
    },
    twitter: {
      card: 'summary',
      title: SITE_NAME,
      description: SITE_DESCRIPTION,
      images: [ogImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
  }
}

export function buildOrganizationJsonLd() {
  const base = getSiteMetadataBase().origin
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: base,
    logo: `${base}/icons/icon-512x512.png`,
    description: SITE_DESCRIPTION,
  }
}
