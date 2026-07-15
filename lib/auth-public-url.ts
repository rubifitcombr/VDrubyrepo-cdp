/** Origem pública do site Vyria (login, recuperação de senha, redirects Supabase). */

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
    return `http://${trimmed}`
  }
  return `https://${trimmed}`
}

/** Server-side: VYRIA_PUBLIC_URL. */
export function getVyriaPublicOriginServer(): string {
  return normalizeOrigin(process.env.VYRIA_PUBLIC_URL ?? '')
}

/** Client-side: NEXT_PUBLIC_VYRIA_PUBLIC_URL ou window.location.origin. */
export function getVyriaPublicOriginClient(): string {
  if (typeof window === 'undefined') return ''
  const fromEnv = normalizeOrigin(process.env.NEXT_PUBLIC_VYRIA_PUBLIC_URL ?? '')
  return fromEnv || window.location.origin
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
