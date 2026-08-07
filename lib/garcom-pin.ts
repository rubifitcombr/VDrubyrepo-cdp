import type { StoreGarcomDTO } from '@/lib/garcons-types'

export type GarcomPinSession = {
  garcomId: string
  nome: string
  /** Epoch ms — sessão expira após 12h sem novo PIN. */
  expiresAt: number
}

const SESSION_PREFIX = 'vyria-garcom-session:'
export const GARCOM_PIN_SESSION_SYNC_EVENT = 'vyria-garcom-pin-session-sync'

/** Sessão PIN do garçom — renovada a cada login por PIN. */
export const GARCOM_PIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000

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

/** Chave de persistência — localStorage partilhado entre abas do mesmo browser. */
export function garcomPinSessionStorageKey(storeId: string): string {
  return `${SESSION_PREFIX}${storeId}`
}

export const garcomPinSessionKey = garcomPinSessionStorageKey

function notifyGarcomPinSessionChanged(storeId: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(GARCOM_PIN_SESSION_SYNC_EVENT, { detail: { storeId } })
  )
}

function parseGarcomPinSession(raw: string): GarcomPinSession | null {
  try {
    const parsed = JSON.parse(raw) as Partial<GarcomPinSession>
    if (!parsed?.garcomId || !parsed?.nome) return null
    const expiresAt =
      typeof parsed.expiresAt === 'number' && Number.isFinite(parsed.expiresAt)
        ? parsed.expiresAt
        : Date.now() + GARCOM_PIN_SESSION_TTL_MS
    if (expiresAt <= Date.now()) return null
    return {
      garcomId: parsed.garcomId,
      nome: parsed.nome,
      expiresAt,
    }
  } catch {
    return null
  }
}

export function getGarcomPinSession(storeId: string): GarcomPinSession | null {
  if (!storeId || typeof window === 'undefined') return null
  try {
    const key = garcomPinSessionKey(storeId)
    let raw = window.localStorage.getItem(key)
    if (!raw) {
      const legacy = window.sessionStorage.getItem(key)
      if (legacy) {
        window.localStorage.setItem(key, legacy)
        window.sessionStorage.removeItem(key)
        raw = legacy
      }
    }
    if (!raw) return null
    const session = parseGarcomPinSession(raw)
    if (!session) {
      window.localStorage.removeItem(key)
      return null
    }
    return session
  } catch {
    return null
  }
}

export function setGarcomPinSession(storeId: string, garcom: StoreGarcomDTO): void {
  if (!storeId || typeof window === 'undefined') return
  try {
    const payload: GarcomPinSession = {
      garcomId: garcom.id,
      nome: garcom.nome,
      expiresAt: Date.now() + GARCOM_PIN_SESSION_TTL_MS,
    }
    window.localStorage.setItem(garcomPinSessionKey(storeId), JSON.stringify(payload))
    notifyGarcomPinSessionChanged(storeId)
  } catch {
    /* ignore */
  }
}

export function clearGarcomPinSession(storeId: string): void {
  if (!storeId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(garcomPinSessionKey(storeId))
    notifyGarcomPinSessionChanged(storeId)
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
