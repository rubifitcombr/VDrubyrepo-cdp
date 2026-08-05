import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { isDeliveryPipelineEnabled } from '@/lib/merchant-operation-mode'

export type OperationalHubContext =
  | 'balcao'
  | 'salao'
  | 'cozinha'
  | 'delivery'
  | 'mesas'
  | 'comandas'
  | 'visao'
  | 'administracao'
  | 'fiscal'
  | 'indique'

const HUB_CONTEXTS = new Set<OperationalHubContext>([
  'balcao',
  'salao',
  'cozinha',
  'delivery',
  'mesas',
  'comandas',
  'visao',
  'administracao',
  'fiscal',
  'indique',
])

const ADMINISTRATION_MENU_KEYS: readonly DashboardMenuKey[] = [
  'dashboard',
  'produtos',
  'pedidos',
  'entregadores',
  'caixa',
  'configuracoes',
  'assinatura',
  'promocoes',
  'relatorios',
  'aparencia',
  'impressao',
  'balanca',
  'kds',
  'pdv',
  'garcom',
  'garcons',
  'automacoes',
  'fiscal',
  'indique',
  'master_whatsapp',
  'master_fidelidade',
  'master_marketing',
]

const HUB_CONTEXT_MENU_KEYS: Record<
  OperationalHubContext,
  readonly DashboardMenuKey[]
> = {
  balcao: ['pdv', 'caixa', 'pedidos'],
  salao: ['garcom', 'pedidos'],
  cozinha: ['kds', 'pedidos'],
  /** Entregadores é o gate do atalho; Pedidos fica no menu focado do canal delivery. */
  delivery: ['entregadores', 'pedidos'],
  mesas: ['garcom'],
  comandas: ['pedidos'],
  visao: ['dashboard'],
  administracao: ADMINISTRATION_MENU_KEYS,
  fiscal: ['fiscal'],
  indique: ['indique'],
}

const HUB_CONTEXT_LABELS: Record<OperationalHubContext, string> = {
  balcao: 'Balcão',
  salao: 'Salão / Mesas',
  cozinha: 'Cozinha',
  delivery: 'Delivery',
  mesas: 'Mesas',
  comandas: 'Comandas',
  visao: 'Visão geral',
  administracao: 'Administração',
  fiscal: 'Vyria Fiscal',
  indique: 'Indique e ganhe',
}

function normalizePathname(pathname: string): string {
  let raw = pathname.split('?')[0] || '/'
  if (raw.length > 1 && raw.endsWith('/')) raw = raw.slice(0, -1)
  return raw
}

export function isOperationalHubContext(
  value: string | null | undefined
): value is OperationalHubContext {
  return !!value && HUB_CONTEXTS.has(value as OperationalHubContext)
}

export function isAdministrationDashboardPath(pathname: string): boolean {
  const n = normalizePathname(pathname)
  return n === '/dashboard/visao' || n.startsWith('/dashboard/visao/')
}

export function isFiscalDashboardPath(pathname: string): boolean {
  const n = normalizePathname(pathname)
  return n === '/dashboard/fiscal' || n.startsWith('/dashboard/fiscal/')
}

/** Hub contexts that mantêm a sidebar completa (não colapsada). */
export function hubContextKeepsFullSidebar(
  context: OperationalHubContext
): boolean {
  return context === 'administracao'
}

export function resolveOperationalHubContext(
  pathname: string,
  hubParam: string | null | undefined
): OperationalHubContext | null {
  if (normalizePathname(pathname) === '/dashboard') return null
  if (isOperationalHubContext(hubParam)) return hubParam
  if (isAdministrationDashboardPath(pathname)) return null
  return null
}

export function shouldShowFocusedHubNavigation(
  pathname: string,
  hubParam: string | null | undefined
): boolean {
  return resolveOperationalHubContext(pathname, hubParam) !== null
}

export function hubContextLabel(context: OperationalHubContext): string {
  return HUB_CONTEXT_LABELS[context]
}

export function menuKeysForHubContext(
  context: OperationalHubContext,
  allowed: ReadonlySet<DashboardMenuKey>
): DashboardMenuKey[] {
  return HUB_CONTEXT_MENU_KEYS[context].filter((key) => allowed.has(key))
}

export function isHubContextVisible(
  context: OperationalHubContext,
  allowed: ReadonlySet<DashboardMenuKey>
): boolean {
  // Presencial tem «Pedidos» (salão/PDV) mas NÃO o atalho Delivery:
  // o tile/hub Delivery só existe com gestão de entregadores.
  if (context === 'delivery') {
    return allowed.has('entregadores')
  }
  return menuKeysForHubContext(context, allowed).length > 0
}

export function isHubMenuKeyVisible(
  key: DashboardMenuKey,
  allowed: ReadonlySet<DashboardMenuKey>
): boolean {
  return allowed.has(key)
}

export function shouldShowDigitalMenuShortcut(
  operationMode: MerchantOperationMode | null
): boolean {
  return isDeliveryPipelineEnabled(operationMode)
}

export function withHubContextHref(
  href: string,
  context: OperationalHubContext | null
): string {
  if (!context) return href
  const [path, query = ''] = href.split('?')
  const params = new URLSearchParams(query)
  params.set('hub', context)
  const qs = params.toString()
  return qs ? `${path}?${qs}` : `${path}?hub=${context}`
}
