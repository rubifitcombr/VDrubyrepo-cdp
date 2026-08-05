/** Origem pública do site Vyria (login, recuperação de senha, redirects Supabase). */

import { getSiteMetadataBase } from '@/lib/site-metadata'

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
    return `http://${trimmed}`
  }
  return `https://${trimmed}`
}

/** Server-side: portal canónico (AUTH_PORTAL_HOSTS / env válido / fallback). */
export function getVyriaPublicOriginServer(): string {
  return getSiteMetadataBase().origin
}

const DEPRECATED_PUBLIC_HOST_SUFFIXES = ['vyriadelivery.com.br'] as const

function isDeprecatedPublicHost(host: string): boolean {
  const h = host.trim().toLowerCase()
  return DEPRECATED_PUBLIC_HOST_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`)
  )
}

/** Client-side: NEXT_PUBLIC_VYRIA_PUBLIC_URL ou window.location.origin. */
export function getVyriaPublicOriginClient(): string {
  if (typeof window === 'undefined') return ''
  const fromEnv = normalizeOrigin(process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL ?? '')
  if (fromEnv) {
    try {
      if (!isDeprecatedPublicHost(new URL(fromEnv).hostname)) return fromEnv
    } catch {
      // ignore invalid env URL
    }
  }
  return window.location.origin
}

export function getPasswordResetRedirectPath(): string {
  return '/login/redefinir-senha'
}

export function getPasswordResetRedirectUrlClient(): string {
  const origin = getVyriaPublicOriginClient()
  if (!origin) return ''
  return `${origin}${getPasswordResetRedirectPath()}`
}

export function getPasswordResetRedirectUrlServer(): string {
  const origin = getVyriaPublicOriginServer()
  if (!origin) return ''
  return `${origin}${getPasswordResetRedirectPath()}`
}
