import type { StoreGarcomDTO } from '@/lib/garcons-types'

export type GarcomPinSession = {
  garcomId: string
  nome: string
}

const SESSION_PREFIX = 'vyria-garcom-session:'

export function normalizeGarcomPin(raw: unknown): string {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, 4)
}

export function isGarcomPinActive(garcom: Pick<StoreGarcomDTO, 'pin_ativo' | 'pin' | 'ativo'>): boolean {
  return garcom.ativo && garcom.pin_ativo && /^\d{4}$/.test(garcom.pin ?? '')
}

export function garconsWithActivePin(garcons: StoreGarcomDTO[]): StoreGarcomDTO[] {
  return garcons.filter(isGarcomPinActive)
}

export function isSalaoGarcomPinRequired(garcons: StoreGarcomDTO[]): boolean {
  return garconsWithActivePin(garcons).length > 0
}

export function matchGarcomByPin(
  garcons: StoreGarcomDTO[],
  pin: string
): StoreGarcomDTO | null {
  const normalized = normalizeGarcomPin(pin)
  if (normalized.length !== 4) return null
  return garconsWithActivePin(garcons).find((g) => g.pin === normalized) ?? null
}

export function garcomPinSessionStorageKey(storeId: string): string {
  return `${SESSION_PREFIX}${storeId}`
}

export function getGarcomPinSession(storeId: string): GarcomPinSession | null {
  if (!storeId || typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(garcomPinSessionStorageKey(storeId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as GarcomPinSession
    if (!parsed?.garcomId || !parsed?.nome) return null
    return parsed
  } catch {
    return null
  }
}

export function setGarcomPinSession(storeId: string, garcom: StoreGarcomDTO): void {
  if (!storeId || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(
      garcomPinSessionStorageKey(storeId),
      JSON.stringify({ garcomId: garcom.id, nome: garcom.nome } satisfies GarcomPinSession)
    )
  } catch {
    /* ignore */
  }
}

export function clearGarcomPinSession(storeId: string): void {
  if (!storeId || typeof window === 'undefined') return
  try {
    window.sessionStorage.removeItem(garcomPinSessionStorageKey(storeId))
  } catch {
    /* ignore */
  }
}

export function isGarcomPinSessionValid(
  storeId: string,
  garcons: StoreGarcomDTO[]
): boolean {
  const session = getGarcomPinSession(storeId)
  if (!session) return false
  return garcons.some(
    (g) => g.id === session.garcomId && isGarcomPinActive(g)
  )
}

export function isSalaoGarcomAccessPath(
  pathname: string,
  hubParam: string | null | undefined
): boolean {
  const hub = hubParam?.trim().toLowerCase()
  if (hub === 'salao' || hub === 'mesas') return true
  return pathname === '/dashboard/garcom' || pathname.startsWith('/dashboard/garcom/')
}
