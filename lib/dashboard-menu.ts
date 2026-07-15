import type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
export type { DashboardMenuKey } from '@/lib/dashboard-menu-types'
import { hasFeature, merchantEntregadoresEnabled, type Plan } from '@/lib/plan'
import type { MerchantOperationMode } from '@/lib/merchant-operation-mode'
import { menuKeysForOperationAndPlan } from '@/lib/merchant-menu-matrix'

/** Com pedidos e canal com entregas (exclui modo «só presencial»). */
function entregadoresMenuContext(operationMode: MerchantOperationMode | null): boolean {
  if (operationMode == null) return true
  return operationMode === 'delivery' || operationMode === 'hibrido'
}

/**
 * Menu quando `stores.operation_mode` é null (legado).
 * **Start** inclui PDV (balcão) — alinhado a Start presencial; modos definidos em loja usam a matriz.
 * Growth **não** inclui `garcom` (legado alinhado a operação só delivery); com modo definido em loja,
 * `menuKeysForMerchant` usa `merchant-menu-matrix` (ex.: Growth presencial inclui Garçom).
 * O mapa completo de garçom no painel continua exclusivo do Pro (`hasFeature(_, 'waiter')`).
 * **Meus garçons** (`garcons`) só entra na matriz Presencial/Híbrido Pro — sem auto-add a partir de `garcom`.
 */
export const MENU_POR_PLANO: Record<
  'start' | 'growth' | 'pro',
  DashboardMenuKey[]
> = {
  start: [
    'dashboard',
    'produtos',
    'pdv',
    'relatorios',
    'configuracoes',
    'assinatura',
  ],
  growth: [
    'dashboard',
    'produtos',
    'pedidos',
    'promocoes',
    'relatorios',
    'automacoes',
    'configuracoes',
    'aparencia',
    'assinatura',
  ],
  pro: [
    'dashboard',
    'produtos',
    'garcom',
    'pedidos',
    'caixa',
    'promocoes',
    'relatorios',
    'automacoes',
    'configuracoes',
    'aparencia',
    'impressao',
    'kds',
    'pdv',
    'assinatura',
  ],
}

const MENU_KEY_TO_PATH_PREFIX: Record<DashboardMenuKey, string> = {
  dashboard: '/dashboard',
  produtos: '/dashboard/menu',
  pedidos: '/dashboard/orders',
  entregadores: '/dashboard/entregadores',
  caixa: '/dashboard/caixa',
  configuracoes: '/dashboard/settings',
  assinatura: '/dashboard/assinatura',
  promocoes: '/dashboard/promotions',
  relatorios: '/dashboard/reports',
  aparencia: '/dashboard/appearance',
  impressao: '/dashboard/printing',
  kds: '/dashboard/kds',
  pdv: '/dashboard/pdv',
  garcom: '/dashboard/garcom',
  garcons: '/dashboard/garcons',
  automacoes: '/dashboard/automations',
  fiscal: '/dashboard/fiscal',
}

function planSlug(plan: Plan): 'start' | 'growth' | 'pro' {
  return plan.toLowerCase() as 'start' | 'growth' | 'pro'
}

export function menuKeysForPlan(plan: Plan): ReadonlySet<DashboardMenuKey> {
  return new Set(MENU_POR_PLANO[planSlug(plan)])
}

/**
 * Chaves de menu efetivas para plano × modo de operação.
 * Com `operationMode === null` (legado), equivale a `menuKeysForPlan(plan)`.
 */
export function menuKeysForMerchant(
  plan: Plan,
  operationMode: MerchantOperationMode | null
): ReadonlySet<DashboardMenuKey> {
  const base =
    operationMode == null
      ? menuKeysForPlan(plan)
      : menuKeysForOperationAndPlan(plan, operationMode)
  const set = new Set(base)
  if (
    merchantEntregadoresEnabled(plan) &&
    set.has('pedidos') &&
    entregadoresMenuContext(operationMode)
  ) {
    set.add('entregadores')
  }
  if (set.has('configuracoes')) {
    set.add('fiscal')
  }
  return set
}

function pathAllowedWithMenuKeys(
  pathname: string,
  plan: Plan,
  keys: ReadonlySet<DashboardMenuKey>
): boolean {
  let raw = pathname.split('?')[0] || '/'
  if (raw.length > 1 && raw.endsWith('/')) raw = raw.slice(0, -1)
  const n = raw

  if (n === '/planos' || n.startsWith('/planos/')) return true
  if (n.startsWith('/dashboard/planos')) return true
  if (n.startsWith('/dashboard/upgrade')) return true
  // Vyria Fiscal é add-on (gated por status no banco), não por plano.
  if (n === '/dashboard/fiscal' || n.startsWith('/dashboard/fiscal/')) return true

  if (n.startsWith('/dashboard/products')) {
    return keys.has('produtos')
  }

  if (n === '/dashboard/inventory' || n.startsWith('/dashboard/inventory/')) {
    return hasFeature(plan, 'inventory')
  }

  if (!n.startsWith('/dashboard')) return true

  for (const key of keys) {
    const prefix = MENU_KEY_TO_PATH_PREFIX[key]
    if (key === 'dashboard') {
      if (n === '/dashboard' || n === '/dashboard/visao') return true
      continue
    }
    if (n === prefix || n.startsWith(`${prefix}/`)) return true
  }

  return false
}

/**
 * Indica se a rota do painel é permitida para o plano (URL manual sem permissão).
 */
export function isPathAllowedForMerchantPlan(
  pathname: string,
  plan: Plan
): boolean {
  return pathAllowedWithMenuKeys(pathname, plan, menuKeysForPlan(plan))
}

/**
 * Plano + modo de operação (null = legado, só plano).
 */
export function isPathAllowedForMerchant(
  pathname: string,
  plan: Plan,
  operationMode: MerchantOperationMode | null
): boolean {
  return pathAllowedWithMenuKeys(
    pathname,
    plan,
    menuKeysForMerchant(plan, operationMode)
  )
}
