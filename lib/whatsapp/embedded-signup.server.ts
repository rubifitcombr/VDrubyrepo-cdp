import 'server-only'

const GRAPH_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`

export type EmbeddedSignupPublicConfig = {
  available: boolean
  appId: string | null
  configId: string | null
}

export function getEmbeddedSignupPublicConfig(): EmbeddedSignupPublicConfig {
  const appId = process.env.META_APP_ID?.trim() || null
  const configId = process.env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID?.trim() || null
  return {
    available: !!(appId && configId && process.env.META_APP_SECRET?.trim()),
    appId,
    configId,
  }
}

export async function exchangeEmbeddedSignupCode(
  code: string
): Promise<{ ok: true; access_token: string } | { ok: false; error: string }> {
  const appId = process.env.META_APP_ID?.trim()
  const appSecret = process.env.META_APP_SECRET?.trim()
  if (!appId || !appSecret) {
    return { ok: false, error: 'App Meta não configurado no servidor.' }
  }

  const params = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    code: code.trim(),
  })

  const url = `${GRAPH_BASE}/oauth/access_token?${params.toString()}`
  const res = await fetch(url, { cache: 'no-store' })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>

  if (!res.ok) {
    const err =
      (json.error as { message?: string } | undefined)?.message ||
      `Meta OAuth HTTP ${res.status}`
    return { ok: false, error: err }
  }

  const token = typeof json.access_token === 'string' ? json.access_token : ''
  if (!token) {
    return { ok: false, error: 'Meta não devolveu access_token.' }
  }

  return { ok: true, access_token: token }
}

/** Inscreve o WABA do lojista na app Vyria (webhook único da plataforma). */
export async function subscribeMerchantWabaToVyriaApp(
  wabaId: string,
  accessToken: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(wabaId)}/subscribed_apps`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err =
      (json.error as { message?: string } | undefined)?.message ||
      `subscribed_apps HTTP ${res.status}`
    return { ok: false, error: err }
  }
  return { ok: true }
}
