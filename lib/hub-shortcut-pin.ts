import { clearGarcomPinSession } from '@/lib/garcom-pin'

export type HubPinShortcut = 'balcao' | 'salao' | 'cozinha' | 'administracao'

export type HubPinEntry = {
  enabled: boolean
  pin: string
}

export type HubPinConfig = Record<HubPinShortcut, HubPinEntry>

export const HUB_PIN_SHORTCUTS: Array<{
  key: HubPinShortcut
  label: string
  description: string
}> = [
  {
    key: 'balcao',
    label: 'Balcão',
    description: 'Protege PDV, caixa e pedidos no contexto Balcão.',
  },
  {
    key: 'salao',
    label: 'Salão e Mesas',
    description:
      'PIN por garçom — configure em Administração → Meus garçons (não use o PIN global da loja).',
  },
  {
    key: 'cozinha',
    label: 'Cozinha',
    description: 'Protege o KDS e a operação de preparo.',
  },
  {
    key: 'administracao',
    label: 'Administração',
    description: 'Protege o painel completo de administração.',
  },
]

/** Atalhos configuráveis na loja (Salão usa PIN por garçom). */
export const HUB_PIN_STORE_SETTINGS_SHORTCUTS = HUB_PIN_SHORTCUTS.filter(
  (item) => item.key !== 'salao'
)

export const HUB_PIN_FIELDS: Record<
  HubPinShortcut,
  { enabled: string; pin: string }
> = {
  balcao: {
    enabled: 'hub_pin_balcao_enabled',
    pin: 'hub_pin_balcao',
  },
  salao: {
    enabled: 'hub_pin_salao_enabled',
    pin: 'hub_pin_salao',
  },
  cozinha: {
    enabled: 'hub_pin_cozinha_enabled',
    pin: 'hub_pin_cozinha',
  },
  administracao: {
    enabled: 'hub_pin_admin_enabled',
    pin: 'hub_pin_admin',
  },
}

export function createEmptyHubPinConfig(): HubPinConfig {
  return {
    balcao: { enabled: false, pin: '' },
    salao: { enabled: false, pin: '' },
    cozinha: { enabled: false, pin: '' },
    administracao: { enabled: false, pin: '' },
  }
}

export function parseHubPinConfig(row: Record<string, unknown> | null): HubPinConfig {
  const config = createEmptyHubPinConfig()
  if (!row) return config

  for (const { key } of HUB_PIN_SHORTCUTS) {
    const fields = HUB_PIN_FIELDS[key]
    const rawValue = row[fields.pin]
    const rawPin = typeof rawValue === 'string' ? rawValue : ''
    const pin = rawPin.replace(/\D/g, '').slice(0, 4)
    config[key] = {
      enabled: row[fields.enabled] === true,
      pin,
    }
  }

  return config
}

export function storeSupportsHubPins(row: Record<string, unknown> | null): boolean {
  if (!row) return false
  return HUB_PIN_SHORTCUTS.every(({ key }) => {
    const fields = HUB_PIN_FIELDS[key]
    return fields.enabled in row && fields.pin in row
  })
}

function normalizePathname(pathname: string): string {
  let raw = pathname.split('?')[0] || '/'
  if (raw.length > 1 && raw.endsWith('/')) raw = raw.slice(0, -1)
  return raw
}

const PIN_PATH_PREFIXES: Array<{ prefix: string; shortcut: HubPinShortcut }> = [
  { prefix: '/dashboard/pdv', shortcut: 'balcao' },
  { prefix: '/dashboard/caixa', shortcut: 'balcao' },
  { prefix: '/dashboard/garcom', shortcut: 'salao' },
  { prefix: '/dashboard/kds', shortcut: 'cozinha' },
  { prefix: '/dashboard/visao', shortcut: 'administracao' },
  { prefix: '/dashboard/fiscal', shortcut: 'administracao' },
  { prefix: '/dashboard/garcons', shortcut: 'administracao' },
]

const OPERATIONAL_DASHBOARD_PREFIXES = [
  '/dashboard/pdv',
  '/dashboard/caixa',
  '/dashboard/garcom',
  '/dashboard/kds',
  '/dashboard/entregadores',
  '/dashboard/orders',
]

function inferPinShortcutFromPath(pathname: string): HubPinShortcut | null {
  const n = normalizePathname(pathname)
  for (const { prefix, shortcut } of PIN_PATH_PREFIXES) {
    if (n === prefix || n.startsWith(`${prefix}/`)) return shortcut
  }
  return null
}

function isNonOperationalDashboardPath(pathname: string): boolean {
  const n = normalizePathname(pathname)
  if (n === '/dashboard' || !n.startsWith('/dashboard/')) return false
  return !OPERATIONAL_DASHBOARD_PREFIXES.some(
    (prefix) => n === prefix || n.startsWith(`${prefix}/`)
  )
}

export function hubPinShortcutForAccess(
  pathname: string,
  hubParam: string | null | undefined
): HubPinShortcut | null {
  if (hubParam === 'balcao') return 'balcao'
  if (hubParam === 'salao' || hubParam === 'mesas') return 'salao'
  if (hubParam === 'cozinha') return 'cozinha'
  if (hubParam === 'administracao') return 'administracao'
  if (hubParam === 'fiscal') return 'administracao'

  const fromPath = inferPinShortcutFromPath(pathname)
  if (fromPath) return fromPath

  if (isNonOperationalDashboardPath(pathname)) return 'administracao'

  return null
}

export function isHubPinActive(entry: HubPinEntry | undefined): entry is HubPinEntry {
  return !!entry?.enabled && /^\d{4}$/.test(entry.pin)
}

export function hubPinUnlockStorageKey(
  storeId: string,
  shortcut: HubPinShortcut,
  pin: string
): string {
  return `vyria-hub-pin:${storeId}:${shortcut}:${pin}`
}

export function isHubPinUnlockRemembered(key: string | null | undefined): boolean {
  if (!key || typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(key) === 'ok'
  } catch {
    return false
  }
}

export function rememberHubPinUnlock(key: string | null | undefined): void {
  if (!key || typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(key, 'ok')
  } catch {
    // Storage can be unavailable in restricted browser modes; keep navigation working.
  }
}

export function clearHubPinUnlocks(storeId: string): void {
  if (!storeId || typeof window === 'undefined') return
  try {
    const prefix = `vyria-hub-pin:${storeId}:`
    const keysToRemove: string[] = []
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i)
      if (key?.startsWith(prefix)) keysToRemove.push(key)
    }
    for (const key of keysToRemove) {
      window.sessionStorage.removeItem(key)
    }
    clearGarcomPinSession(storeId)
  } catch {
    // Ignore storage errors.
  }
}
