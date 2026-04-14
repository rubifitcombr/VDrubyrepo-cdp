import 'server-only'

import { computeDeliveryCharge } from '@/lib/delivery-pricing'
import { haversineKm } from '@/lib/geo-distance'
import { geocodeBrazil } from '@/lib/geocode-nominatim.server'

export type StoreDeliveryConfig = {
  delivery_fee?: number | null
  delivery_free_above?: number | null
  delivery_max_km?: number | null
  store_geo_lat?: number | null
  store_geo_lng?: number | null
  address?: string | null
  name?: string | null
}

let lastNominatimMs = 0
async function throttleNominatim() {
  const now = Date.now()
  const wait = Math.max(0, 1100 - (now - lastNominatimMs))
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastNominatimMs = Date.now()
}

export async function resolveStoreOrigin(
  store: StoreDeliveryConfig
): Promise<{ lat: number; lng: number } | null> {
  const lat = store.store_geo_lat
  const lng = store.store_geo_lng
  if (
    lat != null &&
    lng != null &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  ) {
    return { lat: Number(lat), lng: Number(lng) }
  }

  const addr = typeof store.address === 'string' ? store.address.trim() : ''
  const name = typeof store.name === 'string' ? store.name.trim() : ''
  if (!addr && !name) return null

  await throttleNominatim()
  const q = [name, addr, 'Brasil'].filter(Boolean).join(', ')
  return geocodeBrazil(q)
}

export type DeliveryCheckResult = {
  allowed: boolean
  distanceKm: number | null
  deliveryCharge: number
  reason?: string
}

/**
 * Valida raio (se configurado) e devolve taxa de entrega para o subtotal dado.
 */
export async function evaluateDeliveryForCustomer(
  store: StoreDeliveryConfig,
  customerAddressText: string,
  subtotal: number
): Promise<DeliveryCheckResult> {
  const baseFee = store.delivery_fee != null ? Number(store.delivery_fee) : 0
  const freeAbove =
    store.delivery_free_above != null
      ? Number(store.delivery_free_above)
      : null
  const maxKm =
    store.delivery_max_km != null ? Number(store.delivery_max_km) : null

  const deliveryCharge = computeDeliveryCharge(
    subtotal,
    baseFee,
    freeAbove
  )

  if (maxKm == null || !Number.isFinite(maxKm) || maxKm <= 0) {
    return {
      allowed: true,
      distanceKm: null,
      deliveryCharge,
    }
  }

  const origin = await resolveStoreOrigin(store)
  if (!origin) {
    return {
      allowed: false,
      distanceKm: null,
      deliveryCharge: 0,
      reason:
        'A loja ainda não definiu o ponto de partida (coordenadas ou endereço em Configurações) para calcular o raio de entrega.',
    }
  }

  const destQ = customerAddressText.trim()
  if (destQ.length < 8) {
    return {
      allowed: false,
      distanceKm: null,
      deliveryCharge: 0,
      reason:
        'Indica um endereço mais completo (rua, bairro e cidade) para validar a entrega.',
    }
  }

  await throttleNominatim()
  const dest = await geocodeBrazil(destQ)
  if (!dest) {
    return {
      allowed: false,
      distanceKm: null,
      deliveryCharge: 0,
      reason:
        'Não encontrámos esse endereço no mapa. Confirma cidade e referências.',
    }
  }

  const distanceKm = haversineKm(
    origin.lat,
    origin.lng,
    dest.lat,
    dest.lng
  )

  if (distanceKm > maxKm) {
    return {
      allowed: false,
      distanceKm,
      deliveryCharge: 0,
      reason: `Endereço fora do raio de entrega (máx. ${maxKm} km). Distância aproximada: ${distanceKm.toFixed(1)} km.`,
    }
  }

  return {
    allowed: true,
    distanceKm,
    deliveryCharge,
  }
}
