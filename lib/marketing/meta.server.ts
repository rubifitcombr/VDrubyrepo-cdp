import 'server-only'

export const META_GRAPH_VERSION = 'v19.0'

/** Permissões disponíveis no app Meta (Facebook Login for Business). */
export const META_OAUTH_SCOPES = [
  'ads_management',
  'ads_read',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_ads',
  'business_management',
] as const

export const META_ERRORS: Record<number, string> = {
  100: 'Parâmetro inválido na requisição.',
  190: 'Token de acesso expirado. Reconecte sua conta.',
  200: 'Permissão negada. Verifique as permissões do app.',
  294: 'Conta de anúncios sem permissão. Ative a conta no Meta Business.',
  368: 'Conta de anúncios bloqueada pelo Meta.',
  506: 'Post duplicado. Aguarde antes de impulsionar novamente.',
}

export class MetaApiError extends Error {
  code: number | null
  raw: unknown

  constructor(message: string, code: number | null, raw: unknown) {
    super(message)
    this.name = 'MetaApiError'
    this.code = code
    this.raw = raw
  }
}

export function metaEnv() {
  return {
    appId: process.env.META_APP_ID?.trim() || '',
    appSecret: process.env.META_APP_SECRET?.trim() || '',
    redirectUri:
      process.env.META_REDIRECT_URI?.trim() ||
      'https://acesso.vyriadelivery.com.br/api/marketing/oauth/callback',
  }
}

export function assertMetaEnv() {
  const env = metaEnv()
  if (!env.appId || !env.appSecret || !env.redirectUri) {
    throw new Error('Configuração Meta incompleta. Define META_APP_ID, META_APP_SECRET e META_REDIRECT_URI.')
  }
  return env
}

export function metaGraphUrl(path: string, params: Record<string, string | number | boolean | null | undefined> = {}) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path
  const url = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${cleanPath}`)
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue
    url.searchParams.set(key, String(value))
  }
  return url.toString()
}

export async function readMetaJson<T>(res: Response): Promise<T> {
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  const err = json.error as { code?: number; message?: string; error_user_msg?: string } | undefined
  if (!res.ok || err) {
    const code = typeof err?.code === 'number' ? err.code : null
    const friendly = code != null ? META_ERRORS[code] : null
    throw new MetaApiError(
      friendly || err?.error_user_msg || err?.message || 'Erro ao comunicar com a Meta.',
      code,
      json
    )
  }
  return json as T
}

export async function metaFetch<T>(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const res = await fetch(metaGraphUrl(path, params), { cache: 'no-store' })
  return readMetaJson<T>(res)
}

export async function metaPost<T>(path: string, body: Record<string, unknown>) {
  const res = await fetch(metaGraphUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  return readMetaJson<T>(res)
}

export function normalizeAdAccountPathId(adAccountId: string) {
  const id = adAccountId.trim()
  return id.startsWith('act_') ? id : `act_${id}`
}

export function isTokenExpiredMetaError(error: unknown) {
  return error instanceof MetaApiError && error.code === 190
}

export function tokenExpiredResponse() {
  return { error: 'token_expired', message: META_ERRORS[190] }
}
