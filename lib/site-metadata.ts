import type { Metadata } from 'next'

const SITE_NAME = 'Vyria Delivery'
const SITE_DESCRIPTION =
  'Engenharia de vendas local — gestão de entregas, cardápio digital e painel para restaurantes.'

const CANONICAL_PUBLIC_ORIGIN = 'https://acesseseusistemavyria.online'

/** Domínios legados que não devem mais gerar links públicos (indicação, OG, auth). */
const DEPRECATED_PUBLIC_HOST_SUFFIXES = ['vyriadelivery.com.br'] as const

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

function authPortalOriginFromEnv(): URL | undefined {
  const host = process.env.AUTH_PORTAL_HOSTS?.split(',')[0]?.trim()
  return host ? normalizeSiteOrigin(host) : undefined
}

function isDeprecatedPublicOrigin(url: URL): boolean {
  const host = url.hostname.toLowerCase()
  return DEPRECATED_PUBLIC_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  )
}

function firstValidPublicOrigin(...candidates: (URL | undefined)[]): URL {
  for (const candidate of candidates) {
    if (candidate && !isDeprecatedPublicOrigin(candidate)) return candidate
  }
  return new URL(CANONICAL_PUBLIC_ORIGIN)
}

/** Origem pública para metadados, links de indicação, OG, favicon absoluto e JSON-LD. */
export function getSiteMetadataBase(): URL {
  return firstValidPublicOrigin(
    authPortalOriginFromEnv(),
    normalizeSiteOrigin(process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL),
    normalizeSiteOrigin(process.env.VYRIA_PUBLIC_URL)
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
      ],
      apple: [
        { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      ],
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
