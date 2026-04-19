import type { Plan } from '@/lib/plan'

/** Chaves alinhadas ao menu comercial (filtro do sidebar). */
export type DashboardMenuKey =
  | 'dashboard'
  | 'produtos'
  | 'pedidos'
  | 'financeiro'
  | 'configuracoes'
  | 'assinatura'
  | 'promocoes'
  | 'relatorios'
  | 'aparencia'
  | 'impressao'
  | 'kds'
  | 'pdv'
  | 'estoque'
  | 'automacoes'

export const MENU_POR_PLANO: Record<
  'start' | 'growth' | 'pro' | 'master',
  DashboardMenuKey[]
> = {
  start: [
    'dashboard',
    'produtos',
    'financeiro',
    'configuracoes',
    'assinatura',
  ],
  growth: [
    'dashboard',
    'produtos',
    'pedidos',
    'financeiro',
    'promocoes',
    'relatorios',
    'automacoes',
    'configuracoes',
    'assinatura',
  ],
  pro: [
    'dashboard',
    'produtos',
    'pedidos',
    'financeiro',
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
  master: [
    'dashboard',
    'produtos',
    'pedidos',
    'estoque',
    'financeiro',
    'promocoes',
    'relatorios',
    'configuracoes',
    'aparencia',
    'impressao',
    'automacoes',
    'kds',
    'pdv',
    'assinatura',
  ],
}

const MENU_KEY_TO_PATH_PREFIX: Record<DashboardMenuKey, string> = {
  dashboard: '/dashboard',
  produtos: '/dashboard/menu',
  pedidos: '/dashboard/orders',
  financeiro: '/dashboard/finance',
  configuracoes: '/dashboard/settings',
  assinatura: '/dashboard/assinatura',
  promocoes: '/dashboard/promotions',
  relatorios: '/dashboard/reports',
  aparencia: '/dashboard/appearance',
  impressao: '/dashboard/printing',
  kds: '/dashboard/kds',
  pdv: '/dashboard/pdv',
  estoque: '/dashboard/inventory',
  automacoes: '/dashboard/automations',
}

function planSlug(plan: Plan): 'start' | 'growth' | 'pro' | 'master' {
  return plan.toLowerCase() as 'start' | 'growth' | 'pro' | 'master'
}

export function menuKeysForPlan(plan: Plan): ReadonlySet<DashboardMenuKey> {
  return new Set(MENU_POR_PLANO[planSlug(plan)])
}

/**
 * Indica se a rota do painel é permitida para o plano (URL manual sem permissão).
 */
export function isPathAllowedForMerchantPlan(
  pathname: string,
  plan: Plan
): boolean {
  let raw = pathname.split('?')[0] || '/'
  if (raw.length > 1 && raw.endsWith('/')) raw = raw.slice(0, -1)
  const n = raw

  if (n === '/planos' || n.startsWith('/planos/')) return true
  if (n.startsWith('/dashboard/planos')) return true
  if (n.startsWith('/dashboard/upgrade')) return true

  const keys = menuKeysForPlan(plan)

  if (n.startsWith('/dashboard/products')) {
    return keys.has('produtos')
  }

  if (!n.startsWith('/dashboard')) return true

  for (const key of keys) {
    const prefix = MENU_KEY_TO_PATH_PREFIX[key]
    if (key === 'dashboard') {
      if (n === '/dashboard') return true
      continue
    }
    if (n === prefix || n.startsWith(`${prefix}/`)) return true
  }

  return false
}
