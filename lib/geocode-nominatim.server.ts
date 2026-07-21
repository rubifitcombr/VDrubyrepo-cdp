import 'server-only'

const UA = 'VyriaDelivery/1.0 (delivery-radius; contact: suporte)'

type NominatimHit = {
  lat: string
  lon: string
}

const cache = new Map<string, { lat: number; lng: number; at: number }>()
const TTL_MS = 60 * 60 * 1000

function cacheKey(q: string): string {
  return q.trim().toLowerCase().slice(0, 200)
}

/**
 * Geocodificação via Nominatim (OSM). Respeitar política de uso: cache, 1 req/s.
 */
export async function geocodeBrazil(
  query: string
): Promise<{ lat: number; lng: number } | null> {
  const q = query.trim().slice(0, 500)
  if (q.length < 4) return null

  const key = cacheKey(q)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { lat: hit.lat, lng: hit.lng }
  }

  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', q)
  url.searchParams.set('format', 'json')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'br')

  const res = await fetch(url.toString(), {
    headers: { 'User-Agent': UA },
    next: { revalidate: 3600 },
  })

  if (!res.ok) return null
  const data = (await res.json()) as NominatimHit[]
  const first = data?.[0]
  if (!first?.lat || !first?.lon) return null
  const lat = Number(first.lat)
  const lng = Number(first.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  cache.set(key, { lat, lng, at: Date.now() })
  return { lat, lng }
}
