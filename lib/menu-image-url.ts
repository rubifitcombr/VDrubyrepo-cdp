/** Bucket único para fotos de produtos, logo e banner do cardápio. */
export const MENU_IMAGE_BUCKET = 'product-images'

const PUBLIC_OBJECT_PREFIX = '/storage/v1/object/public/'

export function getSupabaseProjectUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  return url ? url.replace(/\/+$/, '') : null
}

/** Monta URL pública Supabase a partir do path no bucket (ex.: `{storeId}/abc.webp`). */
export function buildSupabasePublicStorageUrl(objectPath: string): string | null {
  const base = getSupabaseProjectUrl()
  if (!base) return null
  const path = objectPath.replace(/^\/+/, '')
  if (!path) return null
  return `${base}${PUBLIC_OBJECT_PREFIX}${MENU_IMAGE_BUCKET}/${path}`
}

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|webp|gif)$/i

function looksLikeStorageObjectPath(value: string): boolean {
  if (value.includes('://') || value.startsWith('data:')) return false
  return /^[\w-]+\/[\w./-]+\.(jpg|jpeg|png|webp|gif)$/i.test(value)
}

function looksLikeBareImageFilename(value: string): boolean {
  if (value.includes('://') || value.startsWith('data:') || value.includes('/')) {
    return false
  }
  return IMAGE_EXT_RE.test(value)
}

function stripBucketPrefix(path: string): string {
  const prefix = `${MENU_IMAGE_BUCKET}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

/** Tenta montar URL pública a partir de path relativo ou nome de ficheiro. */
function buildFromRelativeStoragePath(
  raw: string,
  storeId?: string | null
): string | null {
  let path = stripBucketPrefix(raw.replace(/^\/+/, ''))
  if (!path) return null

  if (looksLikeStorageObjectPath(path)) {
    return buildSupabasePublicStorageUrl(path)
  }

  if (storeId && looksLikeBareImageFilename(path)) {
    return buildSupabasePublicStorageUrl(`${storeId}/${path}`)
  }

  if (storeId && IMAGE_EXT_RE.test(path) && !path.includes('://')) {
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 1) {
      return buildSupabasePublicStorageUrl(`${storeId}/${segments[0]}`)
    }
    if (segments.length >= 2 && !looksLikeStorageObjectPath(path)) {
      const last = segments[segments.length - 1]
      if (IMAGE_EXT_RE.test(last)) {
        return buildSupabasePublicStorageUrl(`${storeId}/${path}`)
      }
    }
  }

  return null
}

function convertSupabaseObjectUrlToPublic(url: string): string {
  try {
    const u = new URL(url)
    const hostOk =
      u.hostname.endsWith('.supabase.co') || u.hostname.endsWith('.supabase.in')
    if (!hostOk) return url

    const publicMatch = u.pathname.match(
      new RegExp(
        `^/storage/v1/object/public/${MENU_IMAGE_BUCKET}/(.+)$`
      )
    )
    if (publicMatch) return url

    const signMatch = u.pathname.match(
      new RegExp(`^/storage/v1/object/sign/${MENU_IMAGE_BUCKET}/(.+)$`)
    )
    if (signMatch) {
      u.pathname = `${PUBLIC_OBJECT_PREFIX}${MENU_IMAGE_BUCKET}/${signMatch[1]}`
      u.search = ''
      return u.toString()
    }

    const authMatch = u.pathname.match(
      new RegExp(`^/storage/v1/object/authenticated/${MENU_IMAGE_BUCKET}/(.+)$`)
    )
    if (authMatch) {
      u.pathname = `${PUBLIC_OBJECT_PREFIX}${MENU_IMAGE_BUCKET}/${authMatch[1]}`
      u.search = ''
      return u.toString()
    }
  } catch {
    /* ignore */
  }
  return url
}

/** Reescreve host Supabase antigo para o project URL actual do deploy. */
function rewriteSupabaseStorageHost(url: string): string {
  const base = getSupabaseProjectUrl()
  if (!base) return url
  try {
    const u = new URL(url)
    const hostOk =
      u.hostname.endsWith('.supabase.co') || u.hostname.endsWith('.supabase.in')
    if (!hostOk) return url
    if (!u.pathname.includes(`${PUBLIC_OBJECT_PREFIX}${MENU_IMAGE_BUCKET}/`)) {
      return url
    }
    const target = new URL(base)
    u.protocol = target.protocol
    u.host = target.host
    return u.toString()
  } catch {
    return url
  }
}

/**
 * Normaliza URLs de imagem do cardápio para exibição e gravação.
 * Corrige protocolo em falta, paths relativos, URLs sign→public e project Supabase desactualizado.
 */
export function resolveMenuImageUrl(
  raw: unknown,
  storeId?: string | null
): string | null {
  if (raw == null) return null
  let value = String(raw).trim()
  if (!value) return null

  if (value.startsWith('blob:') || value.startsWith('data:')) {
    return value
  }

  if (value.startsWith('//')) {
    value = `https:${value}`
  }

  if (!/^https?:\/\//i.test(value) && !value.startsWith('data:')) {
    const fromStorage = buildFromRelativeStoragePath(value, storeId)
    if (fromStorage) return fromStorage

    if (/^[\w.-]+\.[a-z]{2,}/i.test(value)) {
      value = `https://${value}`
    } else {
      return null
    }
  }

  if (value.startsWith('http://')) {
    value = `https://${value.slice('http://'.length)}`
  }

  value = convertSupabaseObjectUrlToPublic(value)
  value = rewriteSupabaseStorageHost(value)

  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'https:' && !value.startsWith('data:')) {
      return null
    }
    return parsed.toString()
  } catch {
    return null
  }
}

/** Hosts que o optimizador `next/image` consegue servir com remotePatterns actuais. */
export function isNextImageOptimizableUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (
      u.hostname.endsWith('.supabase.co') ||
      u.hostname.endsWith('.supabase.in')
    ) {
      return u.pathname.startsWith(`${PUBLIC_OBJECT_PREFIX}`)
    }
    return false
  } catch {
    return false
  }
}

export function normalizeMenuImageUrlForSave(
  raw: unknown,
  storeId?: string | null
): string | null {
  const resolved = resolveMenuImageUrl(raw, storeId)
  if (resolved == null) {
    if (raw == null) return null
    const trimmed = String(raw).trim()
    return trimmed || null
  }
  return resolved
}
