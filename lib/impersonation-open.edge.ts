import type { ImpersonationContext } from '@/lib/impersonation'

const SEP = '.'

function secret(): string | null {
  const s =
    process.env.IMPERSONATION_COOKIE_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    null
  return s && s.length >= 16 ? s : null
}

function base64UrlToBytes(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const b64Std = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(b64Std)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64UrlToString(b64: string): string {
  return new TextDecoder().decode(base64UrlToBytes(b64))
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function signPayload(payloadB64: string): Promise<string | null> {
  const key = secret()
  if (!key) return null
  const enc = new TextEncoder()
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(payloadB64))
  return bytesToBase64Url(new Uint8Array(sig))
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

function legacyParse(raw: string): ImpersonationContext | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationContext>
    const storeId = String(parsed.storeId ?? '').trim()
    if (!storeId) return null
    return {
      storeId,
      storeName: String(parsed.storeName ?? '').trim() || 'lojista',
    }
  } catch {
    return null
  }
}

/** Versão Edge do proxy: valida HMAC do cookie de impersonation sem Node `crypto`. */
export async function openImpersonationContextEdge(
  raw: string | null | undefined
): Promise<ImpersonationContext | null> {
  if (!raw) return null

  const trimmed = raw.trim()
  const key = secret()

  if (!trimmed.includes(SEP)) {
    if (key) return null
    return legacyParse(trimmed)
  }

  const sepIdx = trimmed.lastIndexOf(SEP)
  const payloadB64 = trimmed.slice(0, sepIdx)
  const sig = trimmed.slice(sepIdx + 1)
  const expected = await signPayload(payloadB64)

  if (!expected) {
    return null
  }

  try {
    const a = base64UrlToBytes(sig)
    const b = base64UrlToBytes(expected)
    if (!timingSafeEqualBytes(a, b)) {
      return null
    }
    const json = base64UrlToString(payloadB64)
    return legacyParse(json)
  } catch {
    return null
  }
}
